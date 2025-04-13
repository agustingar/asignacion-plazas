/**
 * Calcula la distancia de Levenshtein entre dos strings
 * @param {string} str1 - Primer string
 * @param {string} str2 - Segundo string
 * @returns {number} - Distancia de Levenshtein
 */
export const levenshteinDistance = (str1, str2) => {
  const m = str1.length;
  const n = str2.length;
  const dp = Array(m + 1).fill().map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) {
    dp[i][0] = i;
  }

  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j - 1] + 1, // sustitución
          dp[i - 1][j] + 1,     // eliminación
          dp[i][j - 1] + 1      // inserción
        );
      }
    }
  }

  return dp[m][n];
};

/**
 * Normaliza un string para comparación
 * @param {string} str - String a normalizar
 * @returns {string} - String normalizado
 */
export const normalizeString = (str) => {
  return str.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
};

/**
 * Calcula la similitud entre dos strings usando la distancia de Levenshtein
 * @param {string} str1 - Primer string
 * @param {string} str2 - Segundo string
 * @returns {number} - Porcentaje de similitud (0-1)
 */
export const calculateStringSimilarity = (str1, str2) => {
  const normalized1 = normalizeString(str1);
  const normalized2 = normalizeString(str2);
  const maxLength = Math.max(normalized1.length, normalized2.length);
  const distance = levenshteinDistance(normalized1, normalized2);
  return 1 - (distance / maxLength);
}; 