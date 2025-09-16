import { createGame } from '@/engine';

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', async () => {
    const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    const loadingScreen = document.getElementById('loadingScreen');
    const loadingProgress = document.getElementById('loadingProgress') as HTMLElement;
    const loadingText = document.getElementById('loadingText') as HTMLElement;

    if (!canvas) {
        console.error('Game canvas not found!');
        return;
    }

    try {
        // Show loading progress
        loadingText.textContent = 'Initializing game engine...';
        loadingProgress.style.width = '20%';

        // Small delay to show loading
        await new Promise(resolve => setTimeout(resolve, 500));

        loadingText.textContent = 'Loading assets...';
        loadingProgress.style.width = '60%';

        // Initialize the game
        const { p1, p2 } = createGame(canvas);

        loadingText.textContent = 'Starting game...';
        loadingProgress.style.width = '100%';

        // Hide loading screen after a short delay
        setTimeout(() => {
            if (loadingScreen) {
                loadingScreen.classList.add('hidden');
            }
        }, 500);

        // Expose game objects for debugging
        (window as any).__qte = { p1, p2 };

        console.log('QTE Fighting Game initialized successfully!');
        console.log('Controls:');
        console.log('P1: WASD (move), E/Q (attacks), R (parry), T/Y (ranged)');
        console.log('P2: Arrow keys (move), Numpad 1-5 (attacks/parry)');

    } catch (error) {
        console.error('Failed to initialize game:', error);
        if (loadingText) {
            loadingText.textContent = 'Failed to load game. Check console for details.';
        }
    }
});
