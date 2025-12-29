/**
 * Minimal Client-side Logo Utilities
 */
class ClientLogoUtils {
    /**
     * Konvertiert Pixel-Position zu normalisiertem Wert (0-1)
     */
    static pixelToNormalized(pixelValue, containerSize) {
        return Math.max(0, Math.min(1, pixelValue / containerSize));
    }

    /**
     * Aktualisiert Logo-Position mit normalisierten Werten und angepasster Skalierung
     */
    static updateLogoPosition(logoElement, normalizedX, normalizedY, scale = null, containerWidth = 150, containerHeight = 150) {
        // Inline normalizedToPercent
        const leftPercent = (normalizedX * 100).toFixed(1) + '%';
        const topPercent = (normalizedY * 100).toFixed(1) + '%';
        
        logoElement.style.left = leftPercent;
        logoElement.style.top = topPercent;
        
        if (scale !== null && !isNaN(scale)) {
            // Berechne angepasste Skalierung basierend auf Container-Größe
            const referenceSize = 150;
            const scaleFactor = Math.min(containerWidth, containerHeight) / referenceSize;
            const adjustedScale = scale * scaleFactor;
            
            // Stelle sicher, dass die Skalierung gültig ist
            const finalScale = isNaN(adjustedScale) ? 0.5 : Math.max(0.1, Math.min(2, adjustedScale));
            
            logoElement.style.transform = `translate(-50%, -50%) scale(${finalScale})`;
        }
    }
}