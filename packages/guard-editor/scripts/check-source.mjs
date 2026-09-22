import { assertPublicBoundary } from './import-boundary.mjs';
import { stageSource } from './stage-source.mjs';
const graph = assertPublicBoundary();
const stage = stageSource();
try { console.log(`${graph.files.length} shared source modules checked; ${stage.files.length} modules staged without external relative references.`); }
finally { stage.cleanup(); }
