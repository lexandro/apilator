import { create } from 'zustand';
import type { Environment, EnvVariable } from '../domain';
import { createEnvironment, createEnvVariable, variableMap } from '../domain';
import { environmentsService } from '../services';

interface EnvironmentsState {
  environments: Environment[];
  activeEnvironmentId: string | null;
  isLoaded: boolean;

  hydrate: () => Promise<void>;

  addEnvironment: (name?: string) => Environment;
  renameEnvironment: (id: string, name: string) => void;
  removeEnvironment: (id: string) => void;
  selectEnvironment: (id: string | null) => void;

  addVariable: (environmentId: string) => void;
  updateVariable: (environmentId: string, variableId: string, patch: Partial<EnvVariable>) => void;
  removeVariable: (environmentId: string, variableId: string) => void;

  getActiveEnvironment: () => Environment | null;
  getVariables: () => Map<string, string>;
}

export const useEnvironmentsStore = create<EnvironmentsState>((set, get) => {
  const persist = () => {
    const { environments, activeEnvironmentId } = get();
    void environmentsService.save(environments, activeEnvironmentId);
  };

  const mapEnvironment = (
    id: string,
    transform: (environment: Environment) => Environment
  ): Environment[] => get().environments.map((e) => (e.id === id ? transform(e) : e));

  return {
    environments: [],
    activeEnvironmentId: null,
    isLoaded: false,

    hydrate: async () => {
      const file = await environmentsService.load();
      const environments = await environmentsService.hydrateSecrets(file.environments);

      set({
        environments,
        activeEnvironmentId: file.activeEnvironmentId,
        isLoaded: true,
      });
    },

    addEnvironment: (name) => {
      const environment = createEnvironment(name);
      set((state) => ({
        environments: [...state.environments, environment],
        activeEnvironmentId: state.activeEnvironmentId ?? environment.id,
      }));
      persist();
      return environment;
    },

    renameEnvironment: (id, name) => {
      set({ environments: mapEnvironment(id, (e) => ({ ...e, name })) });
      persist();
    },

    removeEnvironment: (id) => {
      const environment = get().environments.find((e) => e.id === id);

      // Secrets outlive the file, so they have to be dropped explicitly.
      for (const variable of environment?.variables ?? []) {
        if (variable.secret) void environmentsService.forgetSecret(id, variable.id);
      }

      set((state) => ({
        environments: state.environments.filter((e) => e.id !== id),
        activeEnvironmentId: state.activeEnvironmentId === id ? null : state.activeEnvironmentId,
      }));
      persist();
    },

    selectEnvironment: (id) => {
      set({ activeEnvironmentId: id });
      persist();
    },

    addVariable: (environmentId) => {
      set({
        environments: mapEnvironment(environmentId, (e) => ({
          ...e,
          variables: [...e.variables, createEnvVariable()],
        })),
      });
      persist();
    },

    updateVariable: (environmentId, variableId, patch) => {
      const environments = mapEnvironment(environmentId, (e) => ({
        ...e,
        variables: e.variables.map((v) => (v.id === variableId ? { ...v, ...patch } : v)),
      }));

      set({ environments });

      const updated = environments
        .find((e) => e.id === environmentId)
        ?.variables.find((v) => v.id === variableId);

      if (updated?.secret) {
        void environmentsService.storeSecret(environmentId, updated);
      } else if (patch.secret === false) {
        // Turning a secret back into a plain value must not leave the credential behind.
        void environmentsService.forgetSecret(environmentId, variableId);
      }

      persist();
    },

    removeVariable: (environmentId, variableId) => {
      const variable = get()
        .environments.find((e) => e.id === environmentId)
        ?.variables.find((v) => v.id === variableId);

      if (variable?.secret) void environmentsService.forgetSecret(environmentId, variableId);

      set({
        environments: mapEnvironment(environmentId, (e) => ({
          ...e,
          variables: e.variables.filter((v) => v.id !== variableId),
        })),
      });
      persist();
    },

    getActiveEnvironment: () => {
      const { environments, activeEnvironmentId } = get();
      return environments.find((e) => e.id === activeEnvironmentId) ?? null;
    },

    getVariables: () => variableMap(get().getActiveEnvironment()),
  };
});
