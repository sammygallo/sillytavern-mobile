import { useState, useRef, useEffect } from 'react';
import { User, ChevronDown, Check, Plus, Settings, X } from 'lucide-react';
import { usePersonaStore } from '../../stores/personaStore';
import { PersonaManager } from './PersonaManager';

interface PersonaSelectorProps {
  className?: string;
}

export function PersonaSelector({ className = '' }: PersonaSelectorProps) {
  const { personas, activePersonaId, setActivePersona, getActivePersona } =
    usePersonaStore();
  const [isOpen, setIsOpen] = useState(false);
  const [showManager, setShowManager] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activePersona = getActivePersona();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleManage = () => {
    setIsOpen(false);
    setShowManager(true);
  };

  const handleSelect = (id: string | null) => {
    setActivePersona(id);
    setIsOpen(false);
  };

  return (
    <>
      <div ref={dropdownRef} className={`relative ${className}`}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors"
          aria-label="Persona selector"
          title={activePersona ? `Persona: ${activePersona.name}` : 'Select persona'}
        >
          <div className="w-7 h-7 rounded-full overflow-hidden bg-[var(--color-bg-tertiary)] flex items-center justify-center flex-shrink-0">
            {activePersona?.avatarDataUrl ? (
              <img
                src={activePersona.avatarDataUrl}
                alt={activePersona.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <User size={16} className="text-[var(--color-text-secondary)]" />
            )}
          </div>
          <ChevronDown size={14} className="text-[var(--color-text-secondary)]" />
        </button>

        {isOpen && (
          <div className="absolute right-0 top-full mt-1 min-w-[240px] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg shadow-xl overflow-hidden z-50">
            <div className="px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] border-b border-[var(--color-border)]">
              Persona
            </div>
            {personas.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <p className="text-xs text-[var(--color-text-secondary)] mb-2">
                  No personas yet
                </p>
                <button
                  onClick={handleManage}
                  className="text-xs text-[var(--color-primary)] hover:underline"
                >
                  Create your first persona
                </button>
              </div>
            ) : (
              <ul className="max-h-[300px] overflow-y-auto">
                {personas.map((persona) => {
                  const isActive = persona.id === activePersonaId;
                  return (
                    <li key={persona.id}>
                      <button
                        onClick={() => handleSelect(persona.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-[var(--color-bg-tertiary)] ${
                          isActive ? 'bg-[var(--color-primary)]/10' : ''
                        }`}
                      >
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-[var(--color-bg-tertiary)] flex items-center justify-center flex-shrink-0">
                          {persona.avatarDataUrl ? (
                            <img
                              src={persona.avatarDataUrl}
                              alt={persona.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <User
                              size={16}
                              className="text-[var(--color-text-secondary)]"
                            />
                          )}
                        </div>
                        <span className="flex-1 text-sm text-[var(--color-text-primary)] truncate">
                          {persona.name}
                        </span>
                        {isActive && (
                          <Check size={16} className="text-[var(--color-primary)]" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="border-t border-[var(--color-border)]">
              {activePersonaId && (
                <button
                  onClick={() => handleSelect(null)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] border-b border-[var(--color-border)]"
                >
                  <X size={14} />
                  Clear active persona
                </button>
              )}
              <button
                onClick={handleManage}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]"
              >
                <Plus size={14} />
                New Persona
              </button>
              <button
                onClick={handleManage}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] border-t border-[var(--color-border)]"
              >
                <Settings size={14} />
                Manage Personas
              </button>
            </div>
          </div>
        )}
      </div>

      <PersonaManager isOpen={showManager} onClose={() => setShowManager(false)} />
    </>
  );
}
