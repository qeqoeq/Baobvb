# Claude Code — Baobab

## Projet
Stack : React Native 0.81.5 / Expo SDK 54 / TypeScript 5.9 / React 19 / Supabase / expo-router v6
Store : useSyncExternalStore + AsyncStorage (pas de Zustand, pas de WatermelonDB, pas de NativeWind)

## Règles absolues
- Lire GRAPH_REPORT.md avant toute question d'architecture (s'il existe)
- Toujours lire un fichier avant de le modifier
- Ne modifier que les fichiers explicitement demandés
- Ne jamais retester les tiers figés (Ghost→Legend) ni le moteur de scoring
- reactCompiler doit rester OFF — il cause un SIGSEGV Hermes au démarrage (stringPrototypeMatch)

## Conventions Baobab
- "relationship" remplace "link" partout dans le code et l'UI
- Mutual reveal obligatoire avant tout affichage de score
- Moteur 12 dimensions : trust 35%, support 20%, interactions 20%, affinity 15%, sharedNetwork 10%
- Les scores ne sont jamais visibles avant le mutual reveal

## Mémoire du projet
- Décisions d'architecture : /Users/baobab/Projects/Baobab/owvz/baobab/architecture/
- Features : /Users/baobab/Projects/Baobab/owvz/baobab/features/
- Logs de session : /Users/baobab/Projects/Baobab/owvz/baobab/logs/
