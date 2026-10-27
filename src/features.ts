/**
 * Interruptores do servidor MCP. ESPELHO de `AI_AVATAR_ENABLED` em packages/kanutus-core/src/features.ts: este pacote
 * é público (npm @kanutus/mcp, MIT) e não depende do monorepo, então o valor é repetido aqui. Mudar os dois juntos.
 *
 * Avatar de IA "em breve" desde 26/10/2026 (decisão do Paulo): as ferramentas continuam existindo e aceitando
 * `avatar_id` (nada quebra para quem já usa), mas as descrições dizem "coming soon" e a API ignora o avatar.
 */
export const AI_AVATAR_ENABLED: boolean = false;
