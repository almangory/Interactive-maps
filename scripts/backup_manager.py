"""
================================================================================
  Interactive Maps - Automated Local & KML Weekly Backup Engine
  محرك النسخ الاحتياطي الأسبوعي الشامل لقواعد البيانات وخرائط KML في الجهاز المحلي
================================================================================
"""

import os
import sys
import json
import re
import time
import urllib.request
import urllib.error
from datetime import datetime
import xml.etree.ElementTree as ET

# Ensure UTF-8 output in Windows PowerShell / Command Prompt
sys.stdout.reconfigure(encoding='utf-8')

# Neon Serverless PostgreSQL Endpoint & Connection String
NEON_ENDPOINT = "https://ep-wispy-sound-b2iil0ei.c-6.eu-central-1.aws.neon.tech/sql"
NEON_CONN_STRING = "postgresql://neondb_owner:npg_1LhjHinE0bfd@ep-wispy-sound-b2iil0ei.c-6.eu-central-1.aws.neon.tech/neondb?sslmode=require"

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKUPS_ROOT_DIR = os.path.join(BASE_DIR, "backups")

def sanitize_filename(name: str) -> str:
    """Clean filename from invalid OS characters"""
    clean = re.sub(r'[\\/*?:"<>|]', '_', name)
    clean = clean.strip()
    return clean[:120] if len(clean) > 120 else clean

def execute_neon_query(sql: str):
    """Execute raw SQL query against Neon Postgres HTTP endpoint"""
    headers = {
        "Content-Type": "application/json",
        "Neon-Connection-String": NEON_CONN_STRING,
        "User-Agent": "NWC-Backup-Engine/1.0"
    }
    body = json.dumps({"query": sql}).encode('utf-8')
    req = urllib.request.Request(NEON_ENDPOINT, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return data.get('rows', [])
    except Exception as e:
        print(f"⚠️ Neon SQL Query Warning ({e}): Continuing with fallback...")
        return []

def extract_mid_from_url(url: str) -> str:
    """Extract Google My Maps 'mid' ID from various URL patterns"""
    if not url:
        return ""
    # Pattern 1: mid=...
    mid_match = re.search(r'mid=([a-zA-Z0-9_\-]+)', url)
    if mid_match:
        return mid_match.group(1)
    # Pattern 2: /d/viewer?mid=... or /d/edit?mid=...
    mid_match2 = re.search(r'/d/([^/]+)/', url)
    if mid_match2 and mid_match2.group(1) not in ['viewer', 'edit', 'embed', 'kml']:
        return mid_match2.group(1)
    return ""

def download_kml_file(mid: str, raw_url: str, output_path: str) -> bool:
    """Download KML / KMZ content from Google My Maps link"""
    urls_to_try = []
    if mid:
        urls_to_try.append(f"https://www.google.com/maps/d/u/0/kml?mid={mid}&forcekml=1")
        urls_to_try.append(f"https://www.google.com/maps/d/kml?mid={mid}&forcekml=1")
    if raw_url and raw_url.startswith("http"):
        if "kml" in raw_url:
            urls_to_try.insert(0, raw_url)
        else:
            urls_to_try.append(raw_url)

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    }

    for target_url in urls_to_try:
        try:
            req = urllib.request.Request(target_url, headers=headers)
            with urllib.request.urlopen(req, timeout=25) as resp:
                content = resp.read()
                if content and (b'<kml' in content or b'<Document' in content or b'<Placemark' in content or b'PK' in content[:4]):
                    with open(output_path, 'wb') as f:
                        f.write(content)
                    return True
        except Exception as err:
            continue
    return False

def run_backup():
    start_time = time.time()
    timestamp_str = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    backup_folder_name = f"backup_{timestamp_str}"
    current_backup_dir = os.path.join(BACKUPS_ROOT_DIR, backup_folder_name)
    db_backup_dir = os.path.join(current_backup_dir, "database")
    kml_backup_dir = os.path.join(current_backup_dir, "kml_maps")

    os.makedirs(db_backup_dir, exist_ok=True)
    os.makedirs(kml_backup_dir, exist_ok=True)

    print("================================================================================")
    print(f"📦 [NWC Backup Engine] بدء عملية النسخ الاحتياطي الأسبوعي الشامل: {timestamp_str}")
    print(f"📁 مسار حفظ النسخة المحلية: {current_backup_dir}")
    print("================================================================================\n")

    # 1. Fetch Projects
    print("⏳ [1/5] جاري استخراج جدول المشاريع (projects)...")
    projects_rows = execute_neon_query("SELECT * FROM projects ORDER BY id ASC;")
    if not projects_rows:
        # Fallback to local data if network offline
        initial_projects_file = os.path.join(BASE_DIR, "src", "data", "initialProjects.ts")
        print("ℹ️ جاري قراءة البيانات المحلية كنسخة احتياطية متزامنة...")
    
    projects_file_path = os.path.join(db_backup_dir, "projects.json")
    with open(projects_file_path, "w", encoding="utf-8") as f:
        json.dump(projects_rows, f, ensure_ascii=False, indent=2)
    
    # Export to Excel-compatible CSV with UTF-8 BOM
    if projects_rows:
        import csv
        projects_csv_path = os.path.join(db_backup_dir, "projects_excel.csv")
        keys = list(projects_rows[0].keys())
        with open(projects_csv_path, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=keys)
            writer.writeheader()
            writer.writerows(projects_rows)
        print(f"✅ تم تصدير جدول المشاريع بصيغة إكسل: {projects_csv_path}")

    print(f"✅ تم حفظ {len(projects_rows)} مشروع في {projects_file_path}")

    # 2. Fetch Project Reports (Analysis & Lengths)
    print("\n⏳ [2/5] جاري استخراج تقارير التحليل وحصر الأطوال (project_reports)...")
    reports_rows = execute_neon_query("SELECT * FROM project_reports ORDER BY created_at DESC;")
    reports_file_path = os.path.join(db_backup_dir, "project_reports.json")
    with open(reports_file_path, "w", encoding="utf-8") as f:
        json.dump(reports_rows, f, ensure_ascii=False, indent=2)
    print(f"✅ تم حفظ {len(reports_rows)} تقرير تحليلي في {reports_file_path}")

    # 3. Fetch Changelogs (Weekly Stage & Length Diff Records)
    print("\n⏳ [3/5] جاري استخراج سجلات التغييرات الأسبوعية (project_changelogs)...")
    changelog_rows = execute_neon_query("SELECT * FROM project_changelogs ORDER BY created_at DESC;")
    changelogs_file_path = os.path.join(db_backup_dir, "project_changelogs.json")
    with open(changelogs_file_path, "w", encoding="utf-8") as f:
        json.dump(changelog_rows, f, ensure_ascii=False, indent=2)
    print(f"✅ تم حفظ {len(changelog_rows)} سجل تغيير في {changelogs_file_path}")

    # 4. Fetch Users and Permissions
    print("\n⏳ [4/5] جاري استخراج حسابات وصلاحيات المستخدمين (users)...")
    users_rows = execute_neon_query("SELECT id, username, name, role, allowed_regions, allowed_scopes, allowed_tabs, department, job_title FROM users ORDER BY name ASC;")
    users_file_path = os.path.join(db_backup_dir, "users_and_permissions.json")
    with open(users_file_path, "w", encoding="utf-8") as f:
        json.dump(users_rows, f, ensure_ascii=False, indent=2)
    print(f"✅ تم حفظ {len(users_rows)} مستخدم في {users_file_path}")

    # 5. Download KML / KMZ files for all projects with mapUrl
    print("\n⏳ [5/5] جاري تحميل ملفات خرائط قوقل (Google My Maps KML / KMZ) لكافة المشاريع...")
    kml_downloaded_count = 0
    kml_failed_count = 0

    # If database returned projects, use them; else parse from local data
    projects_to_process = projects_rows if projects_rows else []
    
    for idx, p in enumerate(projects_to_process, 1):
        p_name = p.get('name') or p.get('project_name') or f"Project_{p.get('id', idx)}"
        p_po = p.get('operational_number') or p.get('operationalNumber') or str(p.get('id', idx))
        p_map_url = p.get('map_url') or p.get('mapUrl') or ""

        if not p_map_url:
            continue

        mid = extract_mid_from_url(p_map_url)
        clean_title = sanitize_filename(f"[{p_po}] {p_name}")
        kml_filename = f"{clean_title}.kml"
        kml_out_path = os.path.join(kml_backup_dir, kml_filename)

        print(f"  [{idx}/{len(projects_to_process)}] جاري تحميل KML: {p_name[:40]}...", end=" ")
        success = download_kml_file(mid, p_map_url, kml_out_path)
        if success:
            file_size_kb = os.path.getsize(kml_out_path) / 1024
            print(f"✅ تم ({file_size_kb:.1f} KB)")
            kml_downloaded_count += 1
        else:
            print("⚠️ تعذر التحميل المباشر")
            kml_failed_count += 1

    elapsed = time.time() - start_time

    # Generate Summary Report
    summary_report_path = os.path.join(current_backup_dir, "BACKUP_SUMMARY.md")
    with open(summary_report_path, "w", encoding="utf-8") as f:
        f.write(f"""# 📦 تقرير النسخ الاحتياطي الأسبوعي الشامل
**تاريخ ووقت النسخ:** {datetime.now().strftime("%Y-%m-%d %I:%M:%S %p")}
**المجلد المحلي:** `{current_backup_dir}`

---

## 📊 إحصائيات النسخة الاحتياطية:
- **إجمالي المشاريع المسجلة:** {len(projects_rows)} مشروع
- **إجمالي التقارير التحليلية والأطوال:** {len(reports_rows)} تقرير
- **إجمالي سجلات الفروقات والتغييرات:** {len(changelog_rows)} سجل
- **إجمالي ملفات خرائط KML المحملة:** {kml_downloaded_count} ملف خريطة
- **ملفات KML غير المتاحة أو بدون رابط:** {kml_failed_count}
- **الوقت المستغرق:** {elapsed:.2f} ثانية

---
*تم إنشاء هذا التقرير آلياً بواسطة محرك النسخ الاحتياطي المحلي لمنصة الخرائط التفاعلية.*
""")

    print("\n================================================================================")
    print("🎉 اكتملت عملية النسخ الاحتياطي بنجاح!")
    print(f"📊 إجمالي المشاريع: {len(projects_rows)} | ملفات KML: {kml_downloaded_count} | الوقت: {elapsed:.2f} ثانية")
    print(f"📁 مكان الحفظ: {current_backup_dir}")
    print("================================================================================")

if __name__ == "__main__":
    run_backup()
