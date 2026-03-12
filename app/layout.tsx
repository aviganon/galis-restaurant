import type { Metadata, Viewport } from 'next'
import { Heebo } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

const heebo = Heebo({ 
  subsets: ["latin", "hebrew"],
  variable: '--font-heebo'
});

export const metadata: Metadata = {
  title: 'Restaurant Pro | מערכת ניהול מסעדות',
  description: 'מערכת ניהול מסעדות מתקדמת — עלויות, מתכונים, ספקים וניתוח פיננסי בזמן אמת',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0f',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="he" dir="rtl">
      <body className={`${heebo.variable} font-sans antialiased`}>
        <ThemeProvider>
          {children}
          <Toaster position="top-center" dir="rtl" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  )
}
