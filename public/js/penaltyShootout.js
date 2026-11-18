function renderPenaltyKicks(container, kicks, count) {
    container.replaceChildren();
    for (let i = 0; i < count; i++) {
        const marker = document.createElement('span');
        marker.className = 'penalty-kick ' + (i >= kicks.length ? 'pending' : kicks[i] ? 'scored' : 'missed');
        marker.textContent = i >= kicks.length ? '' : kicks[i] ? '✓' : '✕';
        marker.setAttribute('aria-label', i >= kicks.length ? 'Noch nicht geschossen' : kicks[i] ? 'Getroffen' : 'Verschossen');
        container.appendChild(marker);
    }
}
