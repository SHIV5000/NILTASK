import { useState } from 'react'
import { supabase } from '../lib/shared'

export default function SchoolSignup() {
  const [form, setForm] = useState({
    school_name: '',
    principal_name: '',
    mobile: '',
    subdomain: '',
    email: '',
    password: ''
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.functions.invoke('signup-school', {
      body: JSON.stringify(form)
    })
    setLoading(false)
    if (error) {
      alert('Signup failed: ' + error.message)
    } else {
      alert('School registered! Check your email to confirm.')
      window.location.href = '/login'
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input placeholder="School Name" required onChange={e => setForm({...form, school_name: e.target.value})} />
      <input placeholder="Principal Name" required onChange={e => setForm({...form, principal_name: e.target.value})} />
      <input placeholder="Mobile" required onChange={e => setForm({...form, mobile: e.target.value})} />
      <input placeholder="Subdomain (e.g., dps)" required onChange={e => setForm({...form, subdomain: e.target.value})} />
      <input type="email" placeholder="Principal Email" required onChange={e => setForm({...form, email: e.target.value})} />
      <input type="password" placeholder="Password" required onChange={e => setForm({...form, password: e.target.value})} />
      <button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Sign up school'}</button>
    </form>
  )
}
