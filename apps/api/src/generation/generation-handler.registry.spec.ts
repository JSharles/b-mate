import { GenerationHandlerRegistry } from './generation-handler.registry';

describe('GenerationHandlerRegistry', () => {
  it('registers and resolves one handler per operation type', () => {
    const registry = new GenerationHandlerRegistry();
    const handler = { type: 'document_extraction' } as never;

    registry.register(handler);

    expect(registry.get('document_extraction')).toBe(handler);
    expect(() => registry.register(handler)).toThrow('already registered');
  });

  it('fails closed when no domain handler is registered', () => {
    const registry = new GenerationHandlerRegistry();

    expect(() => registry.get('output_validation')).toThrow(
      'No generation handler',
    );
  });
});
