import { useEnvironmentsStore } from '../../stores';
import './EnvironmentSelector.css';

interface EnvironmentSelectorProps {
  onManage: () => void;
}

export function EnvironmentSelector({ onManage }: EnvironmentSelectorProps) {
  const environments = useEnvironmentsStore((s) => s.environments);
  const activeEnvironmentId = useEnvironmentsStore((s) => s.activeEnvironmentId);
  const selectEnvironment = useEnvironmentsStore((s) => s.selectEnvironment);

  return (
    <div className="environment-selector">
      <select
        className="environment-selector__select"
        value={activeEnvironmentId ?? ''}
        onChange={(e) => selectEnvironment(e.target.value || null)}
        aria-label="Active environment"
        title="Variables from this environment are substituted into requests"
      >
        <option value="">No environment</option>
        {environments.map((environment) => (
          <option key={environment.id} value={environment.id}>
            {environment.name}
          </option>
        ))}
      </select>

      <button
        className="environment-selector__manage"
        onClick={onManage}
        title="Manage environments"
      >
        ⚙
      </button>
    </div>
  );
}
