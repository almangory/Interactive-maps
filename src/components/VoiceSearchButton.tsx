/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, AlertCircle, Loader2, Check } from 'lucide-react';
import { useLanguage } from '../utils/i18n';

interface VoiceSearchButtonProps {
  onSpeechResult: (text: string) => void;
  onAutoSubmit?: () => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  placeholderHint?: string;
}

// Extend Window interface for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export const VoiceSearchButton: React.FC<VoiceSearchButtonProps> = ({
  onSpeechResult,
  onAutoSubmit,
  className = '',
  size = 'md',
  placeholderHint
}) => {
  const { t, isRtl, language } = useLanguage();
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [interimText, setInterimText] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [showTooltip, setShowTooltip] = useState(false);
  const recognitionRef = useRef<any>(null);

  const defaultHint = placeholderHint || (language === 'en' ? 'Speak project name, PO number, or region...' : 'تحدث باسم المشروع، رقم العقد، أو المنطقة...');

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
    }
  }, []);

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      setStatusMessage(t('voice.notSupported'));
      setShowTooltip(true);
      setTimeout(() => setShowTooltip(false), 4000);
      return;
    }

    try {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }

      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;

      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = language === 'en' ? 'en-US' : 'ar-SA';

      recognition.onstart = () => {
        setIsListening(true);
        setInterimText('');
        setStatusMessage(t('voice.listening'));
        setShowTooltip(true);
      };

      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        let isFinal = false;

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          currentTranscript += result[0].transcript;
          if (result.isFinal) {
            isFinal = true;
          }
        }

        setInterimText(currentTranscript);

        if (currentTranscript.trim()) {
          onSpeechResult(currentTranscript);
        }

        if (isFinal) {
          setStatusMessage(t('voice.captured'));
          setTimeout(() => {
            setIsListening(false);
            setShowTooltip(false);
            if (onAutoSubmit) {
              onAutoSubmit();
            }
          }, 800);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setStatusMessage(t('voice.micPermission'));
        } else if (event.error === 'no-speech') {
          setStatusMessage(t('voice.noSpeech'));
        } else {
          setStatusMessage(t('voice.error'));
        }
        setShowTooltip(true);
        setTimeout(() => setShowTooltip(false), 4000);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err) {
      console.error('Failed to initialize speech recognition:', err);
      setIsListening(false);
      setStatusMessage(t('voice.startError'));
      setShowTooltip(true);
      setTimeout(() => setShowTooltip(false), 3000);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
    setShowTooltip(false);
  };

  const toggleListening = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const iconSizes = {
    sm: 'h-3.5 w-3.5',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  };

  const buttonPadding = {
    sm: 'p-1.5',
    md: 'p-2',
    lg: 'p-2.5'
  };

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={toggleListening}
        className={`relative flex items-center justify-center rounded-xl transition-all cursor-pointer font-bold ${buttonPadding[size]} ${
          isListening
            ? 'bg-rose-500 text-white ring-4 ring-rose-200 animate-pulse shadow-md'
            : isSupported
            ? 'bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 border border-slate-200 hover:border-blue-200'
            : 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-60'
        } ${className}`}
        title={isListening ? t('voice.stopTitle') : t('voice.startTitle')}
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {isListening ? (
          <Mic className={`${iconSizes[size]} animate-bounce text-white`} />
        ) : (
          <Mic className={`${iconSizes[size]}`} />
        )}

        {isListening && (
          <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-600"></span>
          </span>
        )}
      </button>

      {/* Floating Popup Card for Live Speech Feedback */}
      {showTooltip && (
        <div className={`absolute top-full mt-2 ${isRtl ? 'right-0 text-right' : 'left-0 text-left'} z-[2000] w-64 bg-slate-900 text-white text-xs p-3 rounded-xl shadow-2xl border border-slate-700 animate-in fade-in slide-in-from-top-2 duration-200`} dir={isRtl ? 'rtl' : 'ltr'}>
          <div className="flex items-center justify-between gap-2 mb-1.5 border-b border-slate-800 pb-1.5">
            <div className="flex items-center gap-1.5 font-extrabold text-blue-400 text-[11px]">
              {isListening ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                  <span>{t('voice.titleActive')}</span>
                </>
              ) : (
                <>
                  <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
                  <span>{t('voice.titleFeature')}</span>
                </>
              )}
            </div>
            {isListening && (
              <button
                type="button"
                onClick={stopListening}
                className="text-[10px] text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-800"
              >
                {t('common.cancel')}
              </button>
            )}
          </div>

          <p className="text-[10.5px] text-slate-300 leading-relaxed">
            {statusMessage}
          </p>

          {interimText && (
            <div className="mt-2 bg-slate-800/90 p-2 rounded-lg border border-slate-700/80">
              <span className="text-[9px] text-slate-400 font-bold block mb-0.5">{t('voice.capturedText')}</span>
              <p className="text-xs font-black text-amber-300 break-words leading-tight">
                "{interimText}"
              </p>
            </div>
          )}

          {!isListening && !interimText && (
            <p className="text-[9.5px] text-slate-400 mt-1 italic">
              {defaultHint}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
