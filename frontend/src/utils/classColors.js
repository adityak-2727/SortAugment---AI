/**
 * Deterministic, cool-harmonized Alpine palette for dynamic recyclable class names.
 * Class names are NEVER hard-coded; colors are assigned from /api/health order
 * or by stable string hash for unknown/custom classes (e.g. "unlabeled").
 */
const CLASS_PALETTE = [
  { bg: '#FBF1E6', text: '#7A4314', border: '#E8CCA8', dot: '#C97A32' }, // cardboard warm sandstone
  { bg: '#E6F5FA', text: '#0E5168', border: '#AEDBF0', dot: '#0284C7' }, // glass alpine cyan
  { bg: '#EDF1F6', text: '#2E3D4F', border: '#C7D3E0', dot: '#5B6F85' }, // metal cool steel
  { bg: '#F2F4EA', text: '#425224', border: '#CFD9B4', dot: '#718A3B' }, // paper frosted sage
  { bg: '#E6F6F0', text: '#0F5C42', border: '#AEDEC8', dot: '#109A6A' }, // plastic glacier mint
  { bg: '#FAECEE', text: '#7B2B33', border: '#E8BFC4', dot: '#C44D58' }, // trash muted coral
  { bg: '#EFEAFA', text: '#49307A', border: '#CEC1EA', dot: '#7B5BC2' }, // frost lavender
  { bg: '#EAF0FB', text: '#1F447A', border: '#B9CEEF', dot: '#3A6FC4' }, // glacier cobalt
];

const UNLABELED_STYLE = {
  bg: '#EDF3F8',
  text: '#42586E',
  border: '#CDDCE8',
  dot: '#6D859C',
};

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function getClassStyle(className, orderedClasses = []) {
  if (!className || className === 'unlabeled') {
    return UNLABELED_STYLE;
  }
  const idx = orderedClasses.indexOf(className);
  const slot = idx >= 0 ? idx % CLASS_PALETTE.length : hashString(className) % CLASS_PALETTE.length;
  return CLASS_PALETTE[slot];
}

export const AXIS_STYLES = {
  lighting: {
    label: 'Lighting',
    bg: '#FEF6E4',
    text: '#7A4704',
    border: '#F0CE8E',
    dot: '#E09526',
  },
  contamination: {
    label: 'Contamination',
    bg: '#FBF0EB',
    text: '#7D351E',
    border: '#EAC5B4',
    dot: '#C45B38',
  },
  condition: {
    label: 'Material Condition',
    bg: '#EBF6FF',
    text: '#08476E',
    border: '#A6D8FC',
    dot: '#0274B3',
  },
};

export function getAxisStyle(axisId) {
  return (
    AXIS_STYLES[axisId] || {
      label: axisId || 'Unknown',
      bg: '#EDF3F8',
      text: '#42586E',
      border: '#CDDCE8',
      dot: '#5C738A',
    }
  );
}