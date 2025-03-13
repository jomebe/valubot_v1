export function createProgressBar(progress) {
  const barLength = 20;
  const filledLength = Math.round(barLength * progress / 100);
  const emptyLength = barLength - filledLength;
  
  return '▰'.repeat(filledLength) + '▱'.repeat(emptyLength);
} 