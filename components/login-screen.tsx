"use client"

import { useState, useRef } from "react"
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth"
import { auth, db } from "@/lib/firebase"
import { doc, getDoc, setDoc } from "firebase/firestore"
import { firestoreConfig } from "@/lib/firestore-config"
import Image from "next/image"
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { 
  ChefHat, 
  UtensilsCrossed, 
  TrendingUp, 
  Users, 
  BarChart3,
  Lock,
  Mail,
  Building2,
  MapPin,
  Phone,
  ArrowLeft,
  Sparkles,
  Quote,
  CheckCircle2,
  Play,
  Volume2,
  VolumeX
} from "lucide-react"

interface LoginScreenProps {}

const features = [
  { icon: BarChart3, title: "דשבורד חי", desc: "ניתוח נתונים בזמן אמת" },
  { icon: ChefHat, title: "ניהול מתכונים", desc: "עץ מוצר מתקדם" },
  { icon: Users, title: "ספקים", desc: "ניהול ומעקב הזמנות" },
  { icon: TrendingUp, title: "רווחיות", desc: "מעקב עלויות והכנסות" }
]

// Animation variants
const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
}

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15 }
  }
}

const scaleIn = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: "easeOut" } }
}

export function LoginScreen(_props: LoginScreenProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [inviteCode, setInviteCode] = useState("")
  const [restaurantName, setRestaurantName] = useState("")
  const [branch, setBranch] = useState("")
  const [registerEmail, setRegisterEmail] = useState("")
  const [registerPassword, setRegisterPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [activeTab, setActiveTab] = useState("login")
  const [isMuted, setIsMuted] = useState(true)
  const [showVideo, setShowVideo] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"]
  })
  
  const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0])
  const heroScale = useTransform(scrollYProgress, [0, 0.5], [1, 1.1])
  const heroY = useTransform(scrollYProgress, [0, 0.5], [0, 100])

  const getAuthErrorHebrew = (code: string) => {
    const map: Record<string, string> = {
      "auth/invalid-credential": "אימייל או סיסמה שגויים",
      "auth/invalid-email": "כתובת אימייל לא תקינה",
      "auth/user-disabled": "החשבון הושבת",
      "auth/user-not-found": "לא נמצא משתמש עם אימייל זה",
      "auth/wrong-password": "סיסמה שגויה",
      "auth/operation-not-allowed": "כניסה באימייל/סיסמה לא מופעלת. בדוק Firebase Console → Authentication → Sign-in method",
      "auth/too-many-requests": "יותר מדי ניסיונות. נסה שוב מאוחר יותר",
    }
    return map[code] || "שגיאה בהתחברות"
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (err: unknown) {
      const code = err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : ""
      setError(getAuthErrorHebrew(code) || (err instanceof Error ? err.message : "שגיאה בהתחברות"))
    } finally {
      setIsLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError("הזן את האימייל שלך כדי לאפס סיסמה")
      return
    }
    setError("")
    setIsLoading(true)
    try {
      await sendPasswordResetEmail(auth, email.trim())
      setError("נשלח אימייל לאיפוס סיסמה — בדוק את תיבת הדואר")
    } catch (err: unknown) {
      const code = err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : ""
      if (code === "auth/user-not-found") setError("לא נמצא משתמש עם אימייל זה")
      else setError(getAuthErrorHebrew(code) || "שגיאה בשליחת אימייל")
    } finally {
      setIsLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    const code = inviteCode.trim().toUpperCase().replace(/\s/g, "")
    const name = restaurantName.trim()
    const br = branch.trim()
    const em = registerEmail.trim()
    const pw = registerPassword
    if (!code) {
      setError("הזן קוד הזמנה")
      return
    }
    if (!em || !pw) {
      setError("הזן אימייל וסיסמה")
      return
    }
    if (pw.length < 6) {
      setError("הסיסמה חייבת להכיל לפחות 6 תווים")
      return
    }
    setIsLoading(true)
    try {
      const { inviteCodesCollection, inviteCodeFields, restaurantsCollection, restaurantFields, usersCollection } = firestoreConfig
      const codeRef = doc(db, inviteCodesCollection, code)
      const codeSnap = await getDoc(codeRef)
      if (!codeSnap.exists()) {
        setError("קוד הזמנה לא תקין")
        setIsLoading(false)
        return
      }
      const codeData = codeSnap.data()
      const codeType = codeData?.[inviteCodeFields.type]
      const used = codeData?.[inviteCodeFields.used]
      if (used) {
        setError("קוד הזמנה כבר נוצל")
        setIsLoading(false)
        return
      }
      if (codeType !== "manager") {
        setError("קוד זה לא מאפשר הקמת מסעדה. פנה למנהל לקבלת קוד מתאים.")
        setIsLoading(false)
        return
      }
      const existingRestId = codeData?.[inviteCodeFields.restaurantId] as string | undefined
      let restId: string
      if (existingRestId) {
        const restSnap = await getDoc(doc(db, restaurantsCollection, existingRestId))
        if (!restSnap.exists()) {
          setError("המסעדה לא נמצאה")
          setIsLoading(false)
          return
        }
        restId = existingRestId
      } else {
        if (!name) {
          setError("הזן שם מסעדה")
          setIsLoading(false)
          return
        }
        restId = `rest_${Date.now()}`
      }
      const userCred = await createUserWithEmailAndPassword(auth, em, pw)
      if (!existingRestId) {
        await setDoc(doc(db, restaurantsCollection, restId), {
          [restaurantFields.name]: name,
          [restaurantFields.branch]: br || "סניף ראשי",
          target: 30,
        })
      }
      await setDoc(doc(db, usersCollection, userCred.user.uid), {
        restaurantId: restId,
        role: "manager",
        email: em,
      }, { merge: true })
      await setDoc(codeRef, { [inviteCodeFields.used]: true }, { merge: true })
      setInviteCode("")
      setRestaurantName("")
      setBranch("")
      setRegisterEmail("")
      setRegisterPassword("")
      setActiveTab("login")
      setError("")
    } catch (err: unknown) {
      const authCode = err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : ""
      if (authCode === "auth/email-already-in-use") {
        setError("אימייל זה כבר רשום במערכת")
      } else {
        setError(err instanceof Error ? err.message : "שגיאה בהרשמה")
      }
    } finally {
      setIsLoading(false)
    }
  }
  
  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Header */}
      <motion.header 
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="fixed top-0 inset-x-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border"
      >
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <motion.div 
            className="flex items-center gap-3"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <UtensilsCrossed className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg">Restaurant Pro</span>
          </motion.div>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            {["תכונות", "מסעדות", "אודות", "צור קשר"].map((item, i) => (
              <motion.a 
                key={item}
                href={`#${["features", "restaurants", "about", "contact"][i]}`}
                className="text-muted-foreground hover:text-foreground transition-colors"
                whileHover={{ y: -2 }}
                whileTap={{ y: 0 }}
              >
                {item}
              </motion.a>
            ))}
          </nav>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button 
              variant="outline" 
              className="hidden md:flex rounded-full"
              onClick={() => document.getElementById('auth-section')?.scrollIntoView({ behavior: 'smooth' })}
            >
              כניסה למערכת
            </Button>
          </motion.div>
        </div>
      </motion.header>

      {/* Hero Section with Video */}
      <section ref={heroRef} className="relative min-h-[90vh] pt-24 pb-16 md:pt-32 md:pb-24 overflow-hidden flex items-center">
        {/* Video Background */}
        <motion.div 
          className="absolute inset-0 z-0"
          style={{ opacity: heroOpacity, scale: heroScale, y: heroY }}
        >
          <video
            ref={videoRef}
            autoPlay
            loop
            muted
            playsInline
            poster="https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1920&q=80"
            className="absolute inset-0 w-full h-full object-cover"
          >
            <source src="https://assets.mixkit.co/videos/13258/13258-720.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/50 to-background" />
        </motion.div>
        
        {/* Mute/Unmute Button */}
        <motion.button
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1, duration: 0.3 }}
          onClick={toggleMute}
          className="absolute bottom-8 left-8 z-30 p-3 rounded-full bg-background/50 backdrop-blur-md border border-border hover:bg-background/80 transition-colors"
        >
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </motion.button>
        
        <div className="container mx-auto px-4 relative z-20">
          <motion.div 
            className="max-w-3xl mx-auto text-center"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            <motion.div variants={fadeInUp}>
              <Badge className="mb-6 rounded-full px-4 py-1.5 text-sm font-medium bg-secondary/80 backdrop-blur-sm text-secondary-foreground">
                <Sparkles className="w-4 h-4 ml-2 animate-pulse" />
                מערכת ניהול מסעדות מתקדמת
              </Badge>
            </motion.div>
            
            <motion.h1 
              variants={fadeInUp}
              className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 text-balance"
            >
              ניהול מסעדות
              <br />
              <span className="text-muted-foreground">ברמה אחרת</span>
            </motion.h1>
            
            <motion.p 
              variants={fadeInUp}
              className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto text-pretty"
            >
              עלויות · מתכונים · ספקים · ניתוח פיננסי בזמן אמת
              <br />
              הכל במקום אחד, נגיש מכל מכשיר
            </motion.p>

            <motion.div 
              variants={fadeInUp}
              className="flex flex-col sm:flex-row gap-4 justify-center"
            >
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button 
                  size="lg" 
                  className="rounded-full px-8 text-base shadow-lg shadow-primary/25"
                  onClick={() => document.getElementById('auth-section')?.scrollIntoView({ behavior: 'smooth' })}
                >
                  התחל עכשיו
                  <ArrowLeft className="w-4 h-4 mr-2" />
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="rounded-full px-8 text-base bg-background/50 backdrop-blur-md"
                  onClick={() => setShowVideo(true)}
                >
                  <Play className="w-4 h-4 ml-2" />
                  צפה בהדגמה
                </Button>
              </motion.div>
            </motion.div>
            
            {/* Animated scroll indicator */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.5, duration: 0.5 }}
              className="absolute bottom-8 left-1/2 -translate-x-1/2"
            >
              <motion.div
                animate={{ y: [0, 10, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                className="w-6 h-10 rounded-full border-2 border-foreground/30 flex items-start justify-center p-2"
              >
                <motion.div className="w-1.5 h-1.5 rounded-full bg-foreground/50" />
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </section>
      
      {/* Video Modal */}
      <AnimatePresence>
        {showVideo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowVideo(false)}
            className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-xl flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="relative w-full max-w-4xl aspect-video rounded-2xl overflow-hidden shadow-2xl"
            >
              <video
                autoPlay
                controls
                className="w-full h-full"
              >
                <source src="https://assets.mixkit.co/videos/13258/13258-720.mp4" type="video/mp4" />
              </video>
              <button
                onClick={() => setShowVideo(false)}
                className="absolute top-4 left-4 p-2 rounded-full bg-background/80 hover:bg-background transition-colors"
              >
                <span className="text-xl">✕</span>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Features Section */}
      <section id="features" className="py-16 md:py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">הכלים שיעזרו לך להצליח</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              מערכת מקיפה לניהול כל היבטי המסעדה שלך
            </p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {features.map((feature, i) => (
              <Card key={i} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-6 text-center">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <feature.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-1">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Recommended Restaurants - אין נתונים */}
      <section id="restaurants" className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">מסעדות</h2>
            <p className="text-muted-foreground">אין נתונים להצגה</p>
          </div>
        </div>
      </section>

      {/* Testimonials - אין נתונים */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <Quote className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="text-2xl md:text-3xl font-bold mb-4">המלצות</h2>
            <p className="text-muted-foreground">אין נתונים להצגה</p>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold mb-6">אודות Restaurant Pro</h2>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  Restaurant Pro הוקמה ב-2020 מתוך הבנה עמוקה של הצרכים הייחודיים של תעשיית המסעדנות בישראל. 
                  המערכת פותחה על ידי צוות של מומחים בתחום הקולינריה והטכנולוגיה.
                </p>
                <ul className="space-y-3">
                  {[
                    "ניסיון בתעשיית המזון",
                    "תמיכה טכנית",
                    "עדכונים ושיפורים שוטפים"
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="relative h-80 md:h-96 rounded-2xl overflow-hidden">
                <Image
                  src="https://images.unsplash.com/photo-1600565193348-f74bd3c7ccdf?w=600&h=800&fit=crop"
                  alt="Restaurant kitchen"
                  fill
                  className="object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Auth Section */}
      <section id="auth-section" className="py-16 md:py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-md mx-auto">
            <Card className="border-0 shadow-xl">
              <CardContent className="p-6 md:p-8">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4">
                    <UtensilsCrossed className="w-8 h-8 text-primary-foreground" />
                  </div>
                  <h2 className="text-2xl font-bold">Restaurant Pro</h2>
                  <p className="text-sm text-muted-foreground mt-1">מערכת ניהול מסעדות מתקדמת</p>
                </div>

                <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setError("") }} className="w-full">
                  <TabsList className="grid grid-cols-2 mb-6 w-full">
                    <TabsTrigger value="login" className="rounded-lg">
                      <Lock className="w-4 h-4 ml-2" />
                      כניסה
                    </TabsTrigger>
                    <TabsTrigger value="register" className="rounded-lg">
                      <Building2 className="w-4 h-4 ml-2" />
                      הרשמה
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="login" className="space-y-4 mt-0">
                    <form onSubmit={handleLogin} className="space-y-4">
                      {error && (
                        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                          {error}
                        </div>
                      )}
                      <div className="space-y-2">
                        <label htmlFor="login-email" className="text-sm font-medium">אימייל</label>
                        <div className="relative">
                          <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            id="login-email"
                            name="email"
                            type="email"
                            placeholder="your@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="pr-10 h-12 rounded-xl"
                            dir="ltr"
                            autoComplete="email"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label htmlFor="login-password" className="text-sm font-medium">סיסמה</label>
                        <div className="relative">
                          <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            id="login-password"
                            name="password"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="pr-10 h-12 rounded-xl"
                            autoComplete="current-password"
                          />
                        </div>
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" id="remember" name="remember" className="rounded" />
                        <span className="text-sm text-muted-foreground">השאר אותי מחובר</span>
                      </label>

                      <Button type="submit" className="w-full h-12 rounded-xl text-base" disabled={isLoading}>
                        {isLoading ? "מתחבר..." : "כניסה למערכת"}
                        {!isLoading && <ArrowLeft className="w-4 h-4 mr-2" />}
                      </Button>

                      <button type="button" onClick={handleForgotPassword} disabled={isLoading} className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors">
                        שכחתי סיסמה
                      </button>
                    </form>
                  </TabsContent>

                  <TabsContent value="register" className="space-y-4 mt-0">
                    <form onSubmit={handleRegister} className="space-y-4">
                      {error && activeTab === "register" && (
                        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                          {error}
                        </div>
                      )}
                      <div className="space-y-2">
                        <label htmlFor="register-invite-code" className="text-sm font-medium">קוד הזמנה</label>
                        <Input
                          id="register-invite-code"
                          value={inviteCode}
                          onChange={(e) => setInviteCode(e.target.value)}
                          placeholder="XXXX-XXXX"
                          className="h-12 rounded-xl text-center tracking-widest font-mono"
                          dir="ltr"
                          autoComplete="one-time-code"
                        />
                        <p className="text-xs text-muted-foreground">קוד שמנהל או בעלים נתן לך</p>
                      </div>

                      <div className="space-y-2">
                        <label htmlFor="register-restaurant-name" className="text-sm font-medium">שם המסעדה (רק לקוד להקמת מסעדה חדשה)</label>
                        <div className="relative">
                          <Building2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            id="register-restaurant-name"
                            value={restaurantName}
                            onChange={(e) => setRestaurantName(e.target.value)}
                            placeholder="השאר ריק אם הקוד למסעדה קיימת"
                            className="pr-10 h-12 rounded-xl"
                            autoComplete="organization"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label htmlFor="register-branch" className="text-sm font-medium">סניף / כתובת (אופציונלי)</label>
                        <div className="relative">
                          <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            id="register-branch"
                            value={branch}
                            onChange={(e) => setBranch(e.target.value)}
                            placeholder="תל אביב - הנמל"
                            className="pr-10 h-12 rounded-xl"
                            autoComplete="street-address"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label htmlFor="register-email" className="text-sm font-medium">אימייל</label>
                        <div className="relative">
                          <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            id="register-email"
                            type="email"
                            value={registerEmail}
                            onChange={(e) => setRegisterEmail(e.target.value)}
                            placeholder="owner@restaurant.com"
                            className="pr-10 h-12 rounded-xl"
                            dir="ltr"
                            autoComplete="email"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label htmlFor="register-password" className="text-sm font-medium">סיסמה</label>
                        <div className="relative">
                          <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            id="register-password"
                            type="password"
                            value={registerPassword}
                            onChange={(e) => setRegisterPassword(e.target.value)}
                            placeholder="לפחות 6 תווים"
                            className="pr-10 h-12 rounded-xl"
                            autoComplete="new-password"
                          />
                        </div>
                      </div>

                      <Button type="submit" className="w-full h-12 rounded-xl text-base" disabled={isLoading}>
                        {isLoading ? "יוצר חשבון..." : "הקמת מסעדה חדשה"}
                        <ArrowLeft className="w-4 h-4 mr-2" />
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">צור קשר</h2>
            <p className="text-muted-foreground mb-8">
              יש לך שאלות? נשמח לעזור!
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="outline" size="lg" className="rounded-full" asChild>
                <a href="tel:03-1234567">
                  <Phone className="w-4 h-4 ml-2" />
                  03-1234567
                </a>
              </Button>
              <Button variant="outline" size="lg" className="rounded-full" asChild>
                <a href="mailto:info@restaurantpro.co.il">
                  <Mail className="w-4 h-4 ml-2" />
                  info@restaurantpro.co.il
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <UtensilsCrossed className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-semibold">Restaurant Pro</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2026 Restaurant Pro. כל הזכויות שמורות.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
