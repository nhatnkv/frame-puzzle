// Row ids are random, so rows made on different devices of one family never collide when they
// are shared. They stay below 2^53, the largest whole number JavaScript and JSON keep exactly,
// and above 2^50, far from the small ids rows made before sharing existed already have.

const LOW = 2 ** 50;
const HIGH = 2 ** 53;

export function newId(): number {
  return LOW + Math.floor(Math.random() * (HIGH - LOW));
}
