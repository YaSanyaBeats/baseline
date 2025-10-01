import { getClient } from './connect'

// Access a specific database
const db = getClient().db('baseline');

export default db;