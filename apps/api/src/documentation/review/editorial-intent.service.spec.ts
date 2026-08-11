import { EditorialIntentService } from './editorial-intent.service';
describe('EditorialIntentService', () => {
  const service = new EditorialIntentService();
  it.each([
    'plus court',
    'plus pédagogique',
    'moins technique',
    'ton rassurant',
    'shorter please',
  ])('routes style instruction %s', (instruction) =>
    expect(service.isEditorial(instruction)).toBe(true),
  );
  it('keeps factual corrections factual', () =>
    expect(service.isEditorial('La livraison est le 18 septembre')).toBe(
      false,
    ));
});
