/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

export function getWhatsAppLink(phone?: string, projectName?: string, opNo?: string): string {
  if (!phone) return '#';
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // Format Saudi local mobile numbers (e.g. 0501234567 -> 966501234567)
  if (cleaned.startsWith('05')) {
    cleaned = '966' + cleaned.substring(1);
  } else if (cleaned.startsWith('5') && cleaned.length === 9) {
    cleaned = '966' + cleaned;
  } else if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }

  let text = 'مرحباً، أود التواصل بشأن مشروع';
  if (projectName) text += ` "${projectName}"`;
  if (opNo) text += ` (الرقم التشغيلي: ${opNo})`;

  return `https://wa.me/${cleaned}?text=${encodeURIComponent(text)}`;
}

export const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = "h-4 w-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767 1.04-0.941 1.238-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c0-5.445 4.43-9.875 9.877-9.875 2.637 0 5.116 1.028 6.98 2.893 1.864 1.865 2.89 4.344 2.888 6.982 0 5.446-4.43 9.876-9.867 9.867m0-21.786C5.558 0 .004 5.55.004 12.368c0 2.17.568 4.29 1.644 6.16L0 24l5.655-1.483a12.33 12.33 0 006.376 1.766h.005c6.808 0 12.364-5.55 12.364-12.368 0-3.303-1.286-6.407-3.623-8.745C18.44 1.286 15.337 0 12.031 0z"/>
  </svg>
);
