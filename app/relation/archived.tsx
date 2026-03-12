import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useRelationsStore } from '../../store/useRelationsStore';

export default function ArchivedRelationsScreen() {
  const { archivedRelations, restoreRelation } = useRelationsStore();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Relations archivees</Text>

      <View style={styles.list}>
        {archivedRelations.map((relation) => (
          <View key={relation.id} style={styles.row}>
            <Text style={styles.name}>{relation.name}</Text>
            <Pressable onPress={() => restoreRelation(relation.id)} style={styles.rowButton}>
              <Text style={styles.rowButtonText}>Restaurer</Text>
            </Pressable>
          </View>
        ))}
        {archivedRelations.length === 0 ? (
          <Text style={styles.empty}>Aucune relation archivee</Text>
        ) : null}
      </View>

      <Pressable onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backButtonText}>Retour Jardin</Text>
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
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 16,
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
  backButton: {
    marginTop: 12,
    backgroundColor: '#2A7C7C',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#F2EDE8',
    fontSize: 14,
    fontWeight: '700',
  },
});
