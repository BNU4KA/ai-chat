import Svg, { Circle, Path, Rect, Text as SvgText } from 'react-native-svg';
export const arcana = [
  'The Fool',
  'The Magician',
  'The High Priestess',
  'The Empress',
  'The Emperor',
  'The Hierophant',
  'The Lovers',
  'The Chariot',
  'Strength',
  'The Hermit',
  'Wheel of Fortune',
  'Justice',
  'The Hanged Man',
  'Death',
  'Temperance',
  'The Devil',
  'The Tower',
  'The Star',
  'The Moon',
  'The Sun',
  'Judgement',
  'The World',
];
const motifs = [
  '',
  'M20 66h24M24 66V50h16v16M32 50V40M26 44l6-6 6 6M32 34C32 29 25 29 25 34C25 39 32 39 32 34C32 29 39 29 39 34C39 39 32 39 32 34',
  'M16 69V28h7v41m18 0V28h7v41M28 42h8v21h-8ZM28 23a6 6 0 0 0 8 0 6 6 0 1 1-8 0',
  'M19 37l4-8 9 4 9-4 4 8M32 53v10M27 58h10',
  'M18 68V38h28v30M22 38v-8h20v8M27 30v-7h10v7M25 52h14m-7-7v14',
  'M22 68V37h20v31M22 37l10-12 10 12M32 29v24m-7-12h14M17 62l10-7m20 7-10-7',
  'M20 64V48m24 16V48M24 37l8 8 8-8c8-9-8-14-8-6-1-8-17-3-8 6ZM20 48l12 8 12-8',
  'M18 59h28l-3-22H21ZM22 59l-4 7m24-7 4 7M32 37V25m-5 5 5-5 5 5M25 47h14',
  'M32 32C32 26 24 26 24 32C24 38 32 38 32 32C32 26 40 26 40 32C40 38 32 38 32 32M44 46c6 2 8 10 2 14-6 4-12 0-12-6M22 54h12',
  'M26 66L36 28l10 38M22 46V66M18 38h8v8h-8ZM22 40v4M20 42h4M26 44h6',
  'M32 27a20 20 0 1 0 0 40 20 20 0 0 0 0-40ZM32 27v40M12 47h40M18 33l28 28m0-28L18 61M32 39a8 8 0 1 0 0 16 8 8 0 0 0 0-16',
  'M32 23v46M20 69h24M18 36h28M20 36l-7 18h14ZM44 36l-7 18h14ZM27 30h10',
  'M18 30h28M32 30v18M32 48l10-8 6 8M24 54h16M32 54v10M28 64h8',
  'M22 30v36M22 32h14v12H22M16 66l30-32M18 68h28',
  'M22 29h8v12h-8Zm13 27h8v12h-8ZM26 41c0 13 13 3 13 15M15 68l17-20 17 20',
  'M20 40l-5-10 15 7m14 3 5-10-15 7M20 40h24l-4 20H24ZM25 61l-8 7m22-7 8 7M27 47h1m8 0h1',
  'M22 70V39h20v31M19 39h26M36 24 30 34 35 33 28 42M15 50l-5 7m39-7 5 7M28 54h8',
  'M32 27l3 11 11 3-11 3-3 11-3-11-11-3 11-3ZM16 27v6M13 30h6M48 27v6M45 30h6M20 65c8-6 16 6 24 0',
  'M24 28a12 12 0 1 1 0 20 9 9 0 1 0 0-20M15 70V54h8v16m18 0V54h8v16M27 66l5-8 5 8',
  'M32 35a12 12 0 1 0 0 24 12 12 0 0 0 0-24ZM32 25v-5m0 49v5M10 47H5m49 0h5M16 31l-4-4m36 4 4-4m-36 36-4 4m36-4 4 4',
  'M20 32h24v10H20M32 42v16M28 56h8M32 24v8M28 28h8M18 68V54h8v14M38 68V54h8v14',
  'M32 23c-25 0-25 48 0 48s25-48 0-48M29 37a3 3 0 1 1 6 0 3 3 0 1 1-6 0M32 40v9M32 45l-8-9M32 45l8-3M32 49l-6 14M32 49l6 8 2 5M12 26h4m-2-2v4m34-2h4m-2-2v4M12 68h4m-2-2v4m32-2h4m-2-2v4',
];
export function TarotCard({ index = 0, height = 64 }: { index?: number; height?: number }) {
  const card = ((index % 22) + 22) % 22;
  return (
    <Svg
      width={(height * 64) / 88}
      height={height}
      viewBox="0 0 64 88"
      aria-hidden={true}
      focusable={false}
    >
      <Rect
        x={1}
        y={1}
        width={62}
        height={86}
        rx={5}
        fill="#f4edda"
        stroke="#bd9b55"
        strokeWidth={1.5}
      />
      <Rect
        x={5}
        y={5}
        width={54}
        height={78}
        rx={2}
        fill="none"
        stroke="#c5ab70"
        strokeWidth={0.7}
      />
      <SvgText x={32} y={14} fill="#7f6638" fontSize={8} textAnchor="middle">
        {card === 0
          ? '0'
          : [
              '',
              'I',
              'II',
              'III',
              'IV',
              'V',
              'VI',
              'VII',
              'VIII',
              'IX',
              'X',
              'XI',
              'XII',
              'XIII',
              'XIV',
              'XV',
              'XVI',
              'XVII',
              'XVIII',
              'XIX',
              'XX',
              'XXI',
            ][card]}
      </SvgText>
      {card === 0 ? (
        <>
          <Circle cx={50} cy={26} r={4.5} fill="#dfb95f" />
          <Path d="M50 18v2m0 12v2m-7-8h2m10 0h2" stroke="#cda74e" strokeWidth={1} />
          <Path d="M16 66 28 60 48 66 44 72H20Z" fill="#d2b987" />
          <Path d="M26 62 38 66 34 70" fill="none" stroke="#a28b64" strokeWidth={1} />
          <Path d="M29 52 26 62M33 52 39 63" stroke="#725743" strokeWidth={3} strokeLinecap="round" />
          <Path d="M28 42 24 56 38 58 34 42Z" fill="#8e9e87" stroke="#64745e" strokeWidth={1} />
          <Circle cx={31} cy={36} r={4} fill="#ddbc94" />
          <Path d="M26 34 34 31 32 35" fill="#bc715d" />
          <Path d="M26 46 18 42M34 44 42 36" stroke="#725743" strokeWidth={2} strokeLinecap="round" />
          <Path d="M34 44 43 35" stroke="#755b46" strokeWidth={1.6} />
          <Circle cx={43} cy={34} r={3.2} fill="#bd866c" />
          <Path d="M18 42 16 34" stroke="#81956c" strokeWidth={1} />
          <Circle cx={16} cy={33} r={2.2} fill="#fffdf2" stroke="#c4af7e" strokeWidth={0.5} />
          <Path
            d="M42 61 46 57 51 59 50 64 44 64Z"
            fill="#fffdf4"
            stroke="#9d8b6a"
            strokeWidth={1}
            strokeLinejoin="round"
          />
        </>
      ) : (
        <>
          <Circle
            cx={32}
            cy={47}
            r={23}
            fill={['#e4ddbe', '#e5d5c1', '#dbe0cc'][card % 3]}
            opacity={0.7}
          />
          <Path
            d={motifs[card]}
            fill="none"
            stroke="#806b46"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      <SvgText
        x={32}
        y={80}
        fill="#806b46"
        fontSize={card === 2 ? 3.6 : 4.2}
        letterSpacing={0.3}
        textAnchor="middle"
      >
        {arcana[card]!.toUpperCase()}
      </SvgText>
    </Svg>
  );
}
