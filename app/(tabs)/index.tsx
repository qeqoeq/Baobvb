import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useRelationsStore } from '../../store/useRelationsStore';

export default function HomeScreen() {
  const [query, setQuery] = useState('');
  const { activeRelations, archiveRelation } = useRelationsStore();

  const filteredRelations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return activeRelations;
    }

    return activeRelations.filter((relation) =>
      relation.name.toLowerCase().includes(normalizedQuery)
    );
  }, [activeRelations, query]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Garden</Text>

      <TextInput
        placeholder="Rechercher une relation"
        placeholderTextColor="#9A958E"
        value={query}
        onChangeText={setQuery}
        style={styles.searchInput}
      />

      <View style={styles.list}>
        {filteredRelations.map((relation) => (
          <View key={relation.id} style={styles.row}>
            <Text style={styles.name}>{relation.name}</Text>
            <Pressable onPress={() => archiveRelation(relation.id)} style={styles.rowButton}>
              <Text style={styles.rowButtonText}>Archiver</Text>
            </Pressable>
          </View>
        ))}
        {filteredRelations.length === 0 ? <Text style={styles.empty}>Aucun resultat</Text> : null}
      </View>

      <Pressable onPress={() => router.push('../relation/archived')} style={styles.archivedLink}>
        <Text style={styles.archivedLinkText}>Voir les archivees</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1115',
    padding: 20,
    paddingTop: 48,
  },
  title: {
    color: '#F2EDE8',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 16,
  },
  searchInput: {
    backgroundColor: '#1A1D23',
    color: '#F2EDE8',
    borderWidth: 1,
    borderColor: '#2B3038',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 20,
  },
  list: {
    flex: 1,
    gap: 10,
  },
  row: {
    backgroundColor: '#1A1D23',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2B3038',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    color: '#F2EDE8',
    fontSize: 16,
  },
  rowButton: {
    backgroundColor: '#242830',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  rowButtonText: {
    color: '#F2EDE8',
    fontSize: 12,
    fontWeight: '600',
  },
  empty: {
    color: '#9A958E',
    textAlign: 'center',
    marginTop: 12,
  },
  archivedLink: {
    marginTop: 12,
    backgroundColor: '#2A7C7C',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  archivedLinkText: {
    color: '#F2EDE8',
    fontSize: 14,
    fontWeight: '700',
  },
});