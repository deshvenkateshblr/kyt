const K = require('../admin/core.js');
const tripDraft = require('./kolkata_siliguri_draft.json');

const vTrip = K.toVirtualTrip(tripDraft);
const staySteps = vTrip.steps.filter(s => s.type === 'stay');
const travelSteps = vTrip.steps.filter(s => s.type === 'travel');
const stopSteps = vTrip.steps.filter(s => s.type === 'stop');

console.log('Total virtual steps:', vTrip.steps.length);
console.log('Stay steps (' + staySteps.length + '):');
staySteps.forEach(s => console.log(`  - [Day ${s.dayId}] ${s.title} (${s.type}, icon: ${s.icon}) notes: "${s.notes.slice(0, 40)}..."`));

console.log('Travel steps (' + travelSteps.length + '):');
travelSteps.forEach(s => console.log(`  - [Day ${s.dayId}] ${s.title} (${s.type}, icon: ${s.icon})`));

console.log('Stop steps count:', stopSteps.length);

