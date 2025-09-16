// Animation Viewer - Standalone JavaScript Version
// Simplified version for browser compatibility

export function getAnimationViewer() {
  return {
    toggle: () => {
      console.log("🎬 Animation Viewer - Standalone version");
      alert(
        "Animation Viewer is not fully implemented in the standalone version.\n\nThis would show all character animations in a modal viewer.\n\nFor full functionality, use the TypeScript version with proper build system."
      );
    },
    show: () => {
      console.log("🎬 Animation Viewer - Show");
      alert("Animation Viewer - Show mode");
    },
    hide: () => {
      console.log("🎬 Animation Viewer - Hide");
    },
  };
}
