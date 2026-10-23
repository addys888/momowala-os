export function closingVariance(types,counts,expected) {
 return types.map(t=>({...t,expected:Number(expected[t.key]),actual:Number(counts[t.key]),difference:Number(counts[t.key])-Number(expected[t.key])})).filter(t=>t.difference!==0);
}
