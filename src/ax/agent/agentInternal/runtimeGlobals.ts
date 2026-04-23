import type {
  AxAgentCompletionProtocol,
  AxAIService,
  AxFunction,
  AxFunctionJSONSchema,
} from '../../ai/types.js';
import { AxAgentProtocolCompletionSignal } from '../completion.js';
import { serializeForEval } from '../optimize.js';
import {
  DISCOVERY_GET_FUNCTION_DEFINITIONS_NAME,
  DISCOVERY_LIST_MODULE_FUNCTIONS_NAME,
} from '../runtime.js';
import {
  type DiscoveryCallableMeta,
  normalizeAndSortDiscoveryFunctionIdentifiers,
  normalizeDiscoveryStringInput,
  renderDiscoveryFunctionDefinitionsMarkdown,
  renderDiscoveryModuleListMarkdown,
  resolveDiscoveryCallableNamespaces,
  sortDiscoveryModules,
} from '../runtimeDiscovery.js';
import type {
  AxAgentFunction,
  AxAgentFunctionCallRecorder,
  AxAgentFunctionModuleMeta,
} from './types.js';

export function wrapFunction(
  fn: AxFunction | AxAgentFunction,
  abortSignal?: AbortSignal,
  ai?: AxAIService,
  protocolForTrigger?: (triggeredBy?: string) => AxAgentCompletionProtocol,
  qualifiedName?: string,
  functionCallRecorder?: AxAgentFunctionCallRecorder
): (...args: unknown[]) => Promise<unknown> {
  return async (...args: unknown[]) => {
    let callArgs: Record<string, unknown>;

    if (
      args.length === 1 &&
      typeof args[0] === 'object' &&
      args[0] !== null &&
      !Array.isArray(args[0])
    ) {
      callArgs = args[0] as Record<string, unknown>;
    } else {
      const paramNames = fn.parameters?.properties
        ? Object.keys(fn.parameters.properties)
        : [];
      callArgs = {};
      paramNames.forEach((name, i) => {
        if (i < args.length) {
          callArgs[name] = args[i];
        }
      });
    }

    const normalizedQualifiedName = qualifiedName ?? fn.name;
    const protocol = protocolForTrigger?.(normalizedQualifiedName);
    try {
      const result = await fn.func(callArgs, { abortSignal, ai, protocol });
      functionCallRecorder?.({
        qualifiedName: normalizedQualifiedName,
        name: fn.name,
        arguments: serializeForEval(callArgs),
        result: serializeForEval(result),
      });
      return result;
    } catch (err) {
      if (err instanceof AxAgentProtocolCompletionSignal) {
        functionCallRecorder?.({
          qualifiedName: normalizedQualifiedName,
          name: fn.name,
          arguments: serializeForEval(callArgs),
        });
        throw err;
      }
      functionCallRecorder?.({
        qualifiedName: normalizedQualifiedName,
        name: fn.name,
        arguments: serializeForEval(callArgs),
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };
}

/**
 * Wraps agent functions under namespaced globals and child agents under
 * a configurable `<module>.*` namespace for the JS runtime session.
 */
export function buildRuntimeGlobals(
  self: any,
  abortSignal?: AbortSignal,
  ai?: AxAIService,
  protocolForTrigger?: (triggeredBy?: string) => AxAgentCompletionProtocol,
  functionCallRecorder?: AxAgentFunctionCallRecorder,
  onDiscoveredNamespaces?: (namespaces: readonly string[]) => void,
  onDiscoveredModules?: (
    modules: readonly string[],
    docs: Readonly<Record<string, string>>
  ) => void,
  onDiscoveredFunctions?: (
    qualifiedNames: readonly string[],
    docs: Readonly<Record<string, string>>
  ) => void
): Record<string, unknown> {
  const s = self as any;
  const globals: Record<string, unknown> = {};
  const callableLookup = new Map<string, DiscoveryCallableMeta>();
  const moduleLookup = new Map<string, string[]>();
  const moduleMetaLookup = new Map<string, AxAgentFunctionModuleMeta>();
  for (const [namespace, meta] of s.agentFunctionModuleMetadata) {
    moduleMetaLookup.set(namespace, meta);
  }
  const registerCallable = (
    meta: DiscoveryCallableMeta,
    qualifiedName: string
  ) => {
    callableLookup.set(qualifiedName, meta);
    if (!moduleLookup.has(meta.module)) {
      moduleLookup.set(meta.module, []);
    }
    moduleLookup.get(meta.module)?.push(qualifiedName);
  };

  // Agent functions under namespace.* (e.g. utils.myFn, custom.otherFn)
  for (const agentFn of s.agentFunctions) {
    const ns = agentFn.namespace ?? 'utils';
    if (!globals[ns] || typeof globals[ns] !== 'object') {
      globals[ns] = {};
    }
    const qualifiedName = `${ns}.${agentFn.name}`;
    (globals[ns] as Record<string, unknown>)[agentFn.name] = wrapFunction(
      agentFn,
      abortSignal,
      ai,
      protocolForTrigger,
      qualifiedName,
      functionCallRecorder
    );
    registerCallable(
      {
        module: ns,
        name: agentFn.name,
        description: agentFn.description,
        parameters: agentFn.parameters,
        returns: agentFn.returns,
        examples: agentFn.examples,
      },
      qualifiedName
    );
  }

  // Child agents under <module>.* namespace
  if (s.agents && s.agents.length > 0) {
    const agentsObj: Record<string, unknown> = {};
    for (const agent of s.agents) {
      const fn = agent.getFunction();

      const qualifiedName = `${s.agentModuleNamespace}.${fn.name}`;
      agentsObj[fn.name] = wrapFunction(
        fn,
        abortSignal,
        ai,
        protocolForTrigger,
        qualifiedName,
        functionCallRecorder
      );
      registerCallable(
        {
          module: s.agentModuleNamespace,
          name: fn.name,
          description: fn.description,
          parameters: fn.parameters,
        },
        qualifiedName
      );
    }
    globals[s.agentModuleNamespace] = agentsObj;
  }

  if (s.functionDiscoveryEnabled) {
    globals[DISCOVERY_LIST_MODULE_FUNCTIONS_NAME] = async (
      modulesInput: unknown
    ): Promise<void> => {
      const modules = sortDiscoveryModules(
        normalizeDiscoveryStringInput(modulesInput, 'modules')
      );
      const docs = Object.fromEntries(
        modules.map((module) => [
          module,
          renderDiscoveryModuleListMarkdown(
            [module],
            moduleLookup,
            moduleMetaLookup
          ),
        ])
      );
      onDiscoveredModules?.(modules, docs);
    };

    globals[DISCOVERY_GET_FUNCTION_DEFINITIONS_NAME] = async (
      functionsInput: unknown
    ): Promise<void> => {
      const items = normalizeAndSortDiscoveryFunctionIdentifiers(
        normalizeDiscoveryStringInput(functionsInput, 'functions')
      );
      const matchedNamespaces = resolveDiscoveryCallableNamespaces(
        items,
        callableLookup
      );
      if (matchedNamespaces.length > 0) {
        onDiscoveredNamespaces?.(matchedNamespaces);
      }
      const docs = Object.fromEntries(
        items.map((qualifiedName) => [
          qualifiedName,
          renderDiscoveryFunctionDefinitionsMarkdown(
            [qualifiedName],
            callableLookup
          ),
        ])
      );
      onDiscoveredFunctions?.(items, docs);
    };
  }

  return globals;
}

export function buildFuncParameters(self: any): AxFunctionJSONSchema {
  const s = self as any;
  return s.program.getSignature().toInputJSONSchema();
}
