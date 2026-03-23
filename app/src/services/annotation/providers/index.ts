import { AnnotationImportProvider } from '../types';
import { foliateProvider } from './foliate';

function createProvider<T extends string>(
  name: T,
  implementation: AnnotationImportProvider,
): AnnotationImportProvider & { name: T } {
  if (name !== implementation.name) {
    throw Error(
      `Annotation provider name "${name}" does not match implementation name "${implementation.name}"`,
    );
  }
  return implementation as AnnotationImportProvider & { name: T };
}

const foliateAnnotationProvider = createProvider('foliate', foliateProvider);

const availableProviders = [
  foliateAnnotationProvider,
  // Add more annotation import providers here
];

export const getAnnotationProviders = (): AnnotationImportProvider[] => {
  return availableProviders;
};
