export default function Login() {
  return (
    <div className="min-h-screen bg-charcoal-900 flex flex-col items-center justify-center gap-8 p-8">
      <div className="flex flex-col items-center gap-2">
        <div className="w-16 h-16 bg-brand rounded-lg flex items-center justify-center mb-2">
          <span className="font-display font-bold text-2xl text-white tracking-widest">BSF</span>
        </div>
        <div className="font-display text-xs tracking-widest uppercase text-brand">Blue Sky Fable</div>
        <h1 className="font-display font-medium text-5xl uppercase text-white tracking-tight text-center">
          Content Studio
        </h1>
        <p className="font-sans text-charcoal-400 text-center max-w-sm mt-2">
          Generate 29-day social campaigns rooted in your lyrics. Push to Buffer in one click.
        </p>
      </div>
      <a
        href="/auth/google"
        className="inline-flex items-center gap-3 bg-white text-charcoal-900 px-6 py-3 rounded font-display font-semibold text-sm tracking-wide uppercase hover:bg-charcoal-050 transition-colors duration-[120ms]"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
          <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
          <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
          <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
        </svg>
        Sign in with Google
      </a>
    </div>
  )
}
