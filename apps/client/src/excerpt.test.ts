import { expect, test } from 'vitest';
import { plainExcerpt } from './excerpt';

test('flattens scraped markdown into readable prose', () => {
  expect(
    plainExcerpt('порывы до 11 м/с\n\nВлажность 80% [...] ##### Погода по месяцам\n\n−2°\n\n0°\n\n| +3° | **+10°** |\n[Gismeteo](https://example.com) ![logo](a.png) FINAL_CLAUSE'),
  ).toBe('порывы до 11 м/с Влажность 80% [...] Погода по месяцам −2° 0° +3° +10° Gismeteo logo FINAL_CLAUSE');
});
