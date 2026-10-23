function clone(value) {
  return value === undefined ? value : structuredClone(value);
}

let autoId = 0;

class FakeDocumentSnapshot {
  constructor(firestore, collection, id) {
    this.firestore = firestore;
    this.collection = collection;
    this.id = id;
    this.exists = firestore.store(collection).has(id);
    this.ref = new FakeDocumentRef(firestore, collection, id);
  }

  data() {
    const value = this.firestore.store(this.collection).get(this.id);
    return value === undefined ? undefined : clone(value);
  }
}

class FakeDocumentRef {
  constructor(firestore, collection, id) {
    this.firestore = firestore;
    this.collection = collection;
    this.id = id;
  }

  async get() {
    return new FakeDocumentSnapshot(
      this.firestore,
      this.collection,
      this.id,
    );
  }

  async set(data) {
    this.firestore.store(this.collection).set(this.id, clone(data));
  }

  async update(data) {
    const map = this.firestore.store(this.collection);
    if (!map.has(this.id)) {
      const error = new Error("Documento não encontrado.");
      error.code = 5;
      throw error;
    }
    map.set(this.id, { ...map.get(this.id), ...clone(data) });
  }

  async delete() {
    this.firestore.store(this.collection).delete(this.id);
  }
}

class FakeQuery {
  constructor(firestore, collection, filters = []) {
    this.firestore = firestore;
    this.collection = collection;
    this.filters = filters;
  }

  where(field, operator, value) {
    if (operator !== "==") {
      throw new Error(`Operador não suportado pelo fake: ${operator}`);
    }
    return new FakeQuery(this.firestore, this.collection, [
      ...this.filters,
      { field, value },
    ]);
  }

  select() {
    return this;
  }

  async get() {
    const docs = [];
    for (const [id, data] of this.firestore.store(this.collection)) {
      if (this.filters.every((filter) => data[filter.field] === filter.value)) {
        docs.push(new FakeDocumentSnapshot(this.firestore, this.collection, id));
      }
    }
    return { docs, empty: docs.length === 0 };
  }
}

class FakeCollection extends FakeQuery {
  doc(id) {
    return new FakeDocumentRef(this.firestore, this.collection, String(id));
  }

  async add(data) {
    autoId += 1;
    const ref = this.doc(`auto_${autoId}`);
    await ref.set(data);
    return ref;
  }
}

class FakeBatch {
  constructor() {
    this.operations = [];
  }

  set(ref, data) {
    this.operations.push(() => ref.set(data));
    return this;
  }

  delete(ref) {
    this.operations.push(() => ref.delete());
    return this;
  }

  async commit() {
    for (const operation of this.operations) {
      await operation();
    }
    this.operations = [];
  }
}

export class FakeFirestore {
  constructor() {
    this.collections = new Map();
  }

  store(collection) {
    if (!this.collections.has(collection)) {
      this.collections.set(collection, new Map());
    }
    return this.collections.get(collection);
  }

  collection(name) {
    return new FakeCollection(this, name);
  }

  batch() {
    return new FakeBatch();
  }
}
