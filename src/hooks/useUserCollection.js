import { useEffect, useState } from 'react'
import {
  collection, onSnapshot, query, orderBy,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'

// users/{uid}/{collectionName} をリアルタイム購読する汎用フック
// 複数端末を同じGoogleアカウントでログインすれば自動的に同期される
export function useUserCollection(collectionName, orderField = 'createdAt') {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setItems([]); setLoading(false); return }
    const q = query(collection(db, 'users', user.uid, collectionName), orderBy(orderField, 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return unsub
  }, [user, collectionName, orderField])

  const add = async (data) => addDoc(collection(db, 'users', user.uid, collectionName), { ...data, createdAt: serverTimestamp() })
  const update = async (id, data) => updateDoc(doc(db, 'users', user.uid, collectionName, id), data)
  const remove = async (id) => deleteDoc(doc(db, 'users', user.uid, collectionName, id))

  return { items, loading, add, update, remove }
}
