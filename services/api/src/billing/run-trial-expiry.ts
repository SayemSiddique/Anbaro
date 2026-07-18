import { expireElapsedTrials } from './jobs.js';

const expired = await expireElapsedTrials();
console.log(`Expired ${expired} elapsed trial subscription(s).`);
