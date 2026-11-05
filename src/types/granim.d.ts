declare module 'granim' {
  interface GranimState {
    gradients: string[][];
    transitionSpeed?: number;
    loop?: boolean;
  }
  interface GranimOptions {
    element: HTMLCanvasElement | string;
    direction?: 'diagonal' | 'left-right' | 'top-bottom' | 'radial' | 'custom';
    isPausedWhenNotInView?: boolean;
    stateTransitionSpeed?: number;
    defaultStateName?: string;
    states: Record<string, GranimState>;
    customDirection?: { x0: string; y0: string; x1: string; y1: string };
    onStart?: () => void;
    onGradientChange?: (details: any) => void;
    onEnd?: () => void;
  }
  class Granim {
    constructor(options: GranimOptions);
    play(): void;
    pause(): void;
    clear(): void;
    destroy(): void;
    changeState(stateName: string): void;
    changeDirection(direction: string): void;
    changeBlendingMode(mode: string): void;
  }
  export default Granim;
}
