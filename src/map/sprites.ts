// 14×14 arcade ghost. # body, W eye white, P pupil.
const GHOST = [
  '.....####.....',
  '...########...',
  '..##########..',
  '.##WW####WW##.',
  '.#WWWW##WWWW#.',
  '##WWPP##WWPP##',
  '##WWPP##WWPP##',
  '###WW####WW###',
  '##############',
  '##############',
  '##############',
  '##############',
  '##.###..###.##',
  '#...##..##...#',
]

function pixelSvg(rows: string[], colors: Record<string, string>) {
  const rects = rows.flatMap((row, y) =>
    [...row].flatMap((ch, x) => (colors[ch] ? [`<rect x="${x}" y="${y}" width="1" height="1" fill="${colors[ch]}"/>`] : [])),
  )
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges">${rects.join('')}</svg>`
}

export function ghostSvg(color: string) {
  return pixelSvg(GHOST, { '#': color, W: '#fff', P: '#2121ff' })
}
