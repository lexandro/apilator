import { useState } from 'react';
import { useEnvironmentsStore } from '../../stores';
import { Input, Button, PasswordInput } from '../common';
import './EnvironmentsModal.css';

interface EnvironmentsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function EnvironmentsModal({ isOpen, onClose }: EnvironmentsModalProps) {
  const environments = useEnvironmentsStore((s) => s.environments);
  const addEnvironment = useEnvironmentsStore((s) => s.addEnvironment);
  const renameEnvironment = useEnvironmentsStore((s) => s.renameEnvironment);
  const removeEnvironment = useEnvironmentsStore((s) => s.removeEnvironment);
  const addVariable = useEnvironmentsStore((s) => s.addVariable);
  const updateVariable = useEnvironmentsStore((s) => s.updateVariable);
  const removeVariable = useEnvironmentsStore((s) => s.removeVariable);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const selected = environments.find((e) => e.id === (selectedId ?? environments[0]?.id)) ?? null;

  return (
    <div className="environments-modal__backdrop" onClick={onClose}>
      <div className="environments-modal" onClick={(e) => e.stopPropagation()}>
        <div className="environments-modal__header">
          <h2 className="environments-modal__title">Environments</h2>
          <button className="environments-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="environments-modal__body">
          <aside className="environments-modal__list">
            {environments.map((environment) => (
              <button
                key={environment.id}
                className={`environments-modal__item ${
                  selected?.id === environment.id ? 'environments-modal__item--active' : ''
                }`}
                onClick={() => setSelectedId(environment.id)}
              >
                {environment.name}
              </button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setSelectedId(addEnvironment().id)}
            >
              + New environment
            </Button>
          </aside>

          <section className="environments-modal__detail">
            {!selected ? (
              <p className="environments-modal__hint">
                Create an environment, then use <code>{'{{name}}'}</code> anywhere in a request.
              </p>
            ) : (
              <>
                <div className="environments-modal__detail-header">
                  <Input
                    type="text"
                    value={selected.name}
                    onChange={(e) => renameEnvironment(selected.id, e.target.value)}
                    aria-label="Environment name"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => {
                      removeEnvironment(selected.id);
                      setSelectedId(null);
                    }}
                    title="Delete environment"
                  >
                    Delete
                  </Button>
                </div>

                <p className="environments-modal__hint">
                  Values marked secret are kept in the Windows Credential Manager, never in
                  the environments file.
                </p>

                <div className="environments-modal__vars">
                  {selected.variables.map((variable) => (
                    <div key={variable.id} className="environments-modal__var">
                      <input
                        type="checkbox"
                        checked={variable.enabled}
                        onChange={(e) =>
                          updateVariable(selected.id, variable.id, { enabled: e.target.checked })
                        }
                        aria-label="Enabled"
                      />

                      <Input
                        type="text"
                        value={variable.key}
                        onChange={(e) =>
                          updateVariable(selected.id, variable.id, { key: e.target.value })
                        }
                        placeholder="Name"
                      />

                      {variable.secret ? (
                        <PasswordInput
                          value={variable.value}
                          onChange={(value) => updateVariable(selected.id, variable.id, { value })}
                          placeholder="Secret value"
                          className="environments-modal__value"
                        />
                      ) : (
                        <Input
                          type="text"
                          value={variable.value}
                          onChange={(e) =>
                            updateVariable(selected.id, variable.id, { value: e.target.value })
                          }
                          placeholder="Value"
                          className="environments-modal__value"
                        />
                      )}

                      <label className="environments-modal__secret" title="Store in the credential manager">
                        <input
                          type="checkbox"
                          checked={variable.secret}
                          onChange={(e) =>
                            updateVariable(selected.id, variable.id, { secret: e.target.checked })
                          }
                        />
                        Secret
                      </label>

                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        onClick={() => removeVariable(selected.id, variable.id)}
                        title="Remove"
                      >
                        ×
                      </Button>
                    </div>
                  ))}

                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => addVariable(selected.id)}
                  >
                    + Add variable
                  </Button>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
