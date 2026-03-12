import { useSyncExternalStore } from 'react';

export type Relation = {
  id: string;
  name: string;
  archived: boolean;
};

type StoreState = {
  relations: Relation[];
};

const state: StoreState = {
  relations: [
    { id: '1', name: 'Olivier', archived: false },
    { id: '2', name: 'Nora', archived: false },
    { id: '3', name: 'Jean', archived: true },
  ],
};

const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state.relations;
}

function setArchived(id: string, archived: boolean) {
  state.relations = state.relations.map((relation) =>
    relation.id === id ? { ...relation, archived } : relation
  );
  emitChange();
}

export function useRelationsStore() {
  const relations = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const activeRelations = relations.filter((relation) => !relation.archived);
  const archivedRelations = relations.filter((relation) => relation.archived);

  const archiveRelation = (id: string) => {
    setArchived(id, true);
  };

  const restoreRelation = (id: string) => {
    setArchived(id, false);
  };

  return {
    relations,
    activeRelations,
    archivedRelations,
    archiveRelation,
    restoreRelation,
  };
}
