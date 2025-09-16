export interface KeyBindings {
  left: string;
  right: string;
  up: string;
  down: string;
  attack1: string;
  attack2: string;
  parry: string;
  ranged1: string;
  ranged2: string;
  transform?: string;
  dodge?: string;
}

export interface InputState {
  [key: string]: boolean;
}

// Default keyboard bindings with new PlayStation-style mapping
export const P1_KEYS: KeyBindings = {
  left: "KeyA",
  right: "KeyD",
  up: "KeyW",
  down: "KeyS",
  attack1: "KeyE",    // R1
  attack2: "KeyQ",    // R2
  parry: "KeyR",      // Triangle (△)
  ranged1: "KeyT",    // L1
  ranged2: "KeyY",    // L2
  transform: "KeyF",  // Square (□)
  dodge: "KeyG",      // Circle (○)
};

export const P2_KEYS: KeyBindings = {
  left: "ArrowLeft",
  right: "ArrowRight",
  up: "ArrowUp",
  down: "ArrowDown",
  attack1: "Numpad1", // R1
  attack2: "Numpad2", // R2
  parry: "Numpad3",   // Triangle (△)
  ranged1: "Numpad4", // L1
  ranged2: "Numpad5", // L2
  transform: "Numpad6", // Square (□)
  dodge: "Numpad7",   // Circle (○)
};

/**
 * Returns a fresh InputState object filled from Keyboard events.
 */
export function createKeyboardListener(target: HTMLElement = document.body) {
  const state: InputState = {};
  function keydown(e: KeyboardEvent) {
    state[e.code] = true;
  }
  function keyup(e: KeyboardEvent) {
    state[e.code] = false;
  }
  target.addEventListener("keydown", keydown);
  target.addEventListener("keyup", keyup);
  return state;
}

/**
 * Read Gamepads and map buttons/axes into an InputState according to provided bindings.
 * PlayStation Controller Layout:
 * X (0) = Jump, Triangle (3) = Parry, Square (2) = Transform, Circle (1) = Dodge
 * L1 (4) = Ranged1, L2 (6) = Ranged2, R1 (5) = Attack1, R2 (7) = Attack2
 * D-Pad (12-15) = Movement, Left Stick (0,1) = Movement
 */
export function readGamepadsUnified(
  p1Bindings: KeyBindings,
  p2Bindings: KeyBindings
): InputState {
  const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
  const inputFromPads: InputState = {};
  const dead = 0.35;
  function mapPadToKeys(pad: Gamepad | null, keys: KeyBindings) {
    if (!pad) return;
    const b = pad.buttons || [];
    const a = pad.axes || [];

    // Movement (D-Pad + Left Stick)
    const left = (b[14] && b[14].pressed) || a[0] < -dead;
    const right = (b[15] && b[15].pressed) || a[0] > dead;
    const up = (b[12] && b[12].pressed) || a[1] < -0.6 || (b[0] && b[0].pressed); // X button for jump
    const down = (b[13] && b[13].pressed) || a[1] > 0.6;

    // PlayStation Button Mapping
    const attack1 = !!(b[5] && b[5].pressed);  // R1
    const attack2 = !!(b[7] && b[7].pressed);  // R2
    const parry = !!(b[3] && b[3].pressed);    // Triangle (△)
    const ranged1 = !!(b[4] && b[4].pressed);  // L1
    const ranged2 = !!(b[6] && b[6].pressed);  // L2
    const transform = !!(b[2] && b[2].pressed); // Square (□)
    const dodge = !!(b[1] && b[1].pressed);    // Circle (○)

    // Map to input state
    if (left) inputFromPads[keys.left] = true;
    if (right) inputFromPads[keys.right] = true;
    if (up) inputFromPads[keys.up] = true;
    if (down) inputFromPads[keys.down] = true;
    if (attack1) inputFromPads[keys.attack1] = true;
    if (attack2) inputFromPads[keys.attack2] = true;
    if (parry) inputFromPads[keys.parry] = true;
    if (ranged1) inputFromPads[keys.ranged1] = true;
    if (ranged2) inputFromPads[keys.ranged2] = true;
    if (transform && keys.transform) inputFromPads[keys.transform] = true;
    if (dodge && keys.dodge) inputFromPads[keys.dodge] = true;
  }
  mapPadToKeys(pads[0], p1Bindings);
  mapPadToKeys(pads[1], p2Bindings);
  return inputFromPads;
}
