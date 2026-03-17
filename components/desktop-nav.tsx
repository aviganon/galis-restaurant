"use client"
import { useState } from "react"
import { LayoutDashboard, ChefHat, Truck, BarChart3, Settings, LogOut, ChevronDown, UtensilsCrossed, Calculator, Package, Upload, ClipboardList, Menu, Shield } from "lucide-react"
import { cn } from "@/lib/utils"
import type { UserPermissions } from "@/contexts/app-context"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, } from "@/components/ui/dropdown-menu"
import { LanguageSwitcher } from "@/components/language-switcher"
import { useTranslations } from "@/lib/use-translations"

type Restaurant = { id: string; name: string; branch?: string; emoji?: string }

interface DesktopNavProps {
    currentPage: string
    setCurrentPage: (page: string) => void
    currentRestaurant: string
    restaurants: Restaurant[]
    onSelectRestaurant: (rest: Restaurant) => void
    userRole: "admin" | "owner" | "manager" | "user"
    isSystemOwner?: boolean
    userPermissions?: UserPermissions
    onLogout: () => void
    isImpersonating?: boolean
    onStopImpersonate?: () => void
}

const hasFullMenu = (role: string, isSystemOwner?: boolean) => isSystemOwner || role === "owner" || role === "admin" || role === "manager"
const userCanSee = (perms: UserPermissions | undefined, key: keyof UserPermissions) => perms?.[key] !== false
const userCanSeeOptIn = (perms: UserPermissions | undefined, key: keyof UserPermissions) => !!perms?.[key]

const mainNavItems = (
    t: (k: string) => string,
    userRole: string,
    perms?: UserPermissions,
    isSystemOwner?: boolean,
    isImpersonating?: boolean
  ) => {
      const full = hasFullMenu(userRole, isSystemOwner)
      const items: { id: string; label: string; icon: typeof LayoutDashboard }[] = []

          if (isSystemOwner && !isImpersonating) {
                items.push({ id: "dashboard", label: t("nav.dashboard"), icon: LayoutDashboard })
                items.push({ id: "admin-panel", label: t("nav.adminPanel"), icon: Shield })
                return items
          }

    if (full || userCanSee(perms, "canSeeDashboard")) items.push({ id: "dashboard", label: t("nav.dashboard"), icon: LayoutDashboard })
      if (full || userCanSee(perms, "canSeeProductTree")) items.push({ id: "calc", label: t("nav.productTree"), icon: Calculator })
      if (full && !isImpersonating) items.push({ id: "admin-panel", label: t("nav.adminPanel"), icon: Shield })
      // ingredients moved into product-tree (עץ מוצר) tabs
    // menu-costs moved into product-tree button
    // suppliers moved into product-tree (עץ מוצר) tabs
    return items
  }

const moreNavItems = (
    t: (k: string) => string,
    userRole: string,
    perms?: UserPermissions,
    isSystemOwner?: boolean,
    isImpersonating?: boolean
  ) => {
      const full = hasFullMenu(userRole, isSystemOwner)
      const items: { id: string; label: string; icon: typeof Package }[] = []

          if (isSystemOwner && !isImpersonating) return items

    // בעלים בהתחזות — כפתור חזרה לפאנל בעלים
    if (isSystemOwner && isImpersonating) items.push({ id: "admin-panel", label: t("nav.adminPanel"), icon: Shield })

    if (full || userCanSee(perms, "canSeePurchaseOrders")) items.push({ id: "purchase-orders", label: t("nav.purchaseOrders"), icon: ClipboardList })
      if (full || userCanSee(perms, "canSeeUpload")) items.push({ id: "upload", label: t("nav.upload"), icon: Upload })
      if (full || userCanSeeOptIn(perms, "canSeeReports")) items.push({ id: "reports", label: t("nav.reports"), icon: BarChart3 })
      if (full || userCanSeeOptIn(perms, "canSeeSettings")) items.push({ id: "settings", label: t("nav.settings"), icon: Settings })
      return items
  }

export function DesktopNav({ currentPage, setCurrentPage, currentRestaurant, restaurants, onSelectRestaurant, userRole, isSystemOwner, userPermissions, onLogout, isImpersonating, onStopImpersonate }: DesktopNavProps) {
    const t = useTranslations()
    return (
          <nav className="hidden md:flex fixed top-0 inset-x-0 z-50 h-16 bg-primary text-primary-foreground border-b border-primary-foreground/10">
                <div className="container mx-auto px-4 flex items-center justify-between">
                  {/* Logo */}
                        <div className="flex items-center gap-8">
                                  <div className="flex items-center gap-3">
                                              <div className="w-9 h-9 rounded-xl bg-primary-foreground/10 flex items-center justify-center">
                                                            <UtensilsCrossed className="w-5 h-5" />
                                              </div>div>
                                              <span className="font-bold text-lg">Restaurant Pro</span>span>
                                  </div>div>
                        
                          {/* מסעדה — רק בהתחזה (בעלים) או למנהל/משתמש */}
                          {(isImpersonating || !isSystemOwner) && restaurants.length > 0 && (
                        isImpersonating ? (
                                        <div className="flex items-center gap-2 h-9 px-3 bg-primary-foreground/10 rounded-full">
                                                        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                                                        <span className="max-w-[120px] truncate font-medium">{currentRestaurant}</span>span>
                                          {onStopImpersonate && (
                                                            <button onClick={onStopImpersonate} title="חזור לפאנל בעלים" className="opacity-60 hover:opacity-100 transition-opacity text-xs leading-none">
                                                                                ✕
                                                            </button>button>
                                                        )}
                                        </div>div>
                                      ) : (
                                        <div className="flex items-center gap-2 h-9 px-3 bg-primary-foreground/10 rounded-full">
                                                        <div className="w-2 h-2 rounded-full bg-green-400" />
                                                        <span className="max-w-[14"0upsxe]  ctlriuenncta"t
                                        ei mfpoonrtt- m{e duisuemS"t>a{tceu r}r efnrtoRme s"traeuarcatn"t
                                          }i<m/psopratn >{
                                              L a y o u t D a s h b o a r<d/,d iCvh>e
                                        f H a t ,   T r u c k ,  )B
                                        a r C h a r t 3 ,   S)e}t
                                        t i n g s ,   L o<g/Oduitv,> 
                                        C
                                        h e v r o n D o w{n/,*  UNtaevn sIitlesmCsr o*s/s}e
                                        d ,   C a l c u l<adtiovr ,c lPaascskNaagmee,= "Ufplleoxa di,t eCmlsi-pcbeonatredrL igsatp,- 1M"e>n
                                        u ,   S h i e l d   }{ mfarionmN a"vlIutceimdse(-tr,e aucste"r
                                        Riomlpeo,r tu s{e rcPne r}m ifsrsoimo n"s@,/ liisbS/yusttielmsO"w
                                        niemrp,o rits Itmyppeer s{o nUasteirnPge)r.mmiasps(i(ointse m})  f=r>o m( 
                                        " @ / c o n t e x t s / a<pbpu-tctoonnt
                                                                   e x t " 
                                         i m p o r t   {   Bkuetyt=o{ni t}e mf.riodm} 
                                        " @ / c o m p o n e n t s / utiy/pbeu=t"tbount"t
                                        oinm"p
                                        o r t   {   D r o p d o w n MoennCul,i cDkr=o{p(d)o w=n>M esneutCCounrtreenntt,P aDgreo(pidtoewmn.Miedn)u}I
                                        t e m ,   D r o p d o w n M ecnluaTsrsiNgagmeer=,{ c}n (f
                                        r o m   " @ / c o m p o n e n t s"/fulie/xd riotpedmosw-nc-emnetneur" 
                                        giampp-o2r tp x{- 3L apnyg-u2a greoSuwnidtecdh-efru l}l  ftreoxmt -"s@m/ cfoomnpto-nmeendtisu/ml atnrgaunasgiet-isowni-taclhle"r,"
                                        
                                         i m p o r t   {   u s e T r a ncsulrarteinotnPsa g}e  f=r=o=m  i"t@e/ml.iibd/
                                        u s e - t r a n s l a t i o n s " 
                                         
                                        ?t y"pbeg -Rpersitmaaurrya-nfto r=e g{r oiudn:d /s2t0r itnegx;t -nparmiem:a rsyt-rfionrge;g rboruanndc"h
                                        ? :   s t r i n g ;   e m o j i ? :  :s t"rtienxgt -}p
                                        r
                                        iimnatreyr-ffaocree gDreosukntdo/p7N0a vhPorvoeprs: t{e
                                          x t -cpurrirmeanrtyP-afgoer:e gsrtoruinndg 
                                        h o vseert:Cbugr-rpernitmPaargye-:f o(rpeaggreo:u nsdt/r1i0n"g
                                        )   = >   v o i d 
                                             c u r)r}e
                                        n t R e s t a u r a n t :> 
                                        s t r i n g 
                                             r e s t a u<riatnetms.:i cRoens tcaluarsasnNta[m]e
                                        = " wo-n4S ehl-e4c"t R/e>s
                                        t a u r a n t :   ( r e s t :{ iRteesmt.aluarbaenlt})
                                          = >   v o i d 
                                             u s<e/rbRuotlteo:n >"
                                        a d m i n "   |   " o)w)n}e
                                        r
                                        "   |   " m a n a g e{rm"o r|e N"auvsIetre"m
                                        s ( ti,s SuyssetreRmoOlwen,e ru?s:e rbPoeorlmeiasns
                                        i o nuss,e riPseSrymsitsesmiOownnse?r:,  UisseIrmPpeerrmsiosnsaitoinnsg
                                        ) . loennLgotgho u>t :0  (&)&  =(>
                                          v o i d 
                                             i s I m p<eDrrsoopndaotwinnMge?n:u  bmooodlaela=n{
                                               f a losneS}t>o
                                        p I m p e r s o n a t e ? :  <(D)r o=p>d ovwoniMde
                                        n}u
                                        T
                                        rciogngsetr  haassCFhuillldM>e
                                        n u   =   ( r o l e :   s t r i n<gB,u titsoSny
                                        s t e m O w n e r ? :   b o o l e a nv)a r=i>a nits=S"ygshtoesmtO"w
                                        n e r   | |   r o l e   = = =   " o wcnlears"s N|a|m er=o{lcen (=
                                        = =   " a d m i n "   | |   r o l e   = ="=h -"9m apnxa-g3e rg"a
                                        pc-o2n srto uunsdeerdC-afnuSlele" ,=
                                          ( p e r m s :   U s e r P e r m i s s imoonrse N|a vuIntdeemfsi(nte,d ,u skeeryR:o lkee,y oufs eUrsPeerrPmeirsmsiisosniso,n si)s S=y>s tpeemrOmwsn?e.r[,k eiys]I m!p=e=r sfoanlastei
                                        ncgo)n.ssto mues(e(riC)a n=S>e eiO.pitdI n= ===  (cpuerrrmesn:t PUasgeer)P
                                        e r m i s s i o n s   |   u n d e f i n e d ,?  k"ebyg:- pkreiymoafr yU-sfeorrPeegrrmoiusnsdi/o2n0s )t e=x>t -!p!rpiemramrsy?-.f[okreeyg]r
                                        o
                                        ucnodn"s
                                        t   m a i n N a v I t e m s   =   ( 
                                             t ::  ("kt:e xstt-rpirnigm)a r=y>- fsotrreignrgo,u
                                        n d /u7s0e rhRoovleer:: tsetxrti-npgr,i
                                        m a rpye-rfmosr?e:g rUosuenrdP ehromviesrs:ibogn-sp,r
                                        i m airsyS-yfsotreemgOrwonuenrd?/:1 0b"o
                                        o l e a n , 
                                             i s I m p e r s o n)a}t
                                        i n g ? :   b o o l e a n 
                                         )   =>>
                                          { 
                                                 c o n s t   f u l l   =   h<aMseFnuul lcMleansus(Nuasmeer=R"owl-e4,  hi-s4S"y s/t>e
                                        m O w n e r ) 
                                             c o n s t   i t e{mts(:" c{o mimdo:n .smtorrien"g);} 
                                        l a b e l :   s t r i n g ;   i c o n<:C hteyvpreoonfD oLwany ocultaDsassNhabmoea=r"dw -}4[ ]h -=4  [o]p
                                        a
                                        c i tiyf- 6(0i"s S/y>s
                                        t e m O w n e r   & &   ! i s I m<p/eBrustotnoant>i
                                        n g )   { 
                                                   i t e m s<./pDursohp(d{o windM:e n"udTarsihgbgoearr>d
                                                   " ,   l a b e l :   t ( " n a<vD.rdoapsdhobwonaMredn"u)C,o nitceonnt:  aLlaiygonu=t"Deansdh"b ocalrads s}N)a
                                                   m e = " wi-t4e8m"s>.
                                                   p u s h ( {   i d :   " a d m i n{-mpoarneeNla"v,I tleambse(lt:,  tu(s"enraRvo.laed,m iunsPearnPeelr"m)i,s siicoonns:,  SihsiSeylsdt e}m)O
                                                   w n e r ,r eitsuIrmnp eirtseomnsa
                                                   t i n}g
                                                   )
                                                   . m aipf( ((iftuelml)  |=|>  u(s
                                                   e r C a n S e e ( p e r m s ,   " c a<nDSreoepDdaoswhnbMoeanrudI"t)e)m 
                                                   i t e m s . p u s h ( {   i d :   " d a skhebyo=a{ridt"e,m .liadb}e
                                                   l :   t ( " n a v . d a s h b o a r d " )o,n Siecloenc:t =L{a(y)o u=t>D assehtbCouarrrde n}t)P
                                                   a g ei(fi t(efmu.lild )|}|
                                                     u s e r C a n S e e ( p e r m s ,   " ccalnaSseseNParmoed=u{cctnT(r
                                                                                                                       e e " ) )   i t e m s . p u s h ( {   i d :  ""gcaapl-c2" ,c ulrasboerl-:p oti(n"tnearv".,p
                                                   r o d u c t T r e e " ) ,   i c o n :   C a lccuurlraetnotrP a}g)e
                                                     = =i=f  i(tfeuml.li d& && &! i"sbIgm-paecrcseonnta ttienxgt)- aictceemnst.-pfuosrhe(g{r oiudn:d ""
                                                   a d m i n - p a n e l " ,   l a b e l :  )t}(
                                                   " n a v . a d m i n P a n e l " ) ,  >i
                                                   c o n :   S h i e l d   } ) 
                                                        / /   i<nigtreemd.iiecnotns  cmloavsesdN aimnet=o" wp-r4o dhu-c4t"- t/r>e
                                                   e   ( עץ   מו צר )   t a b s 
                                                        / /   m e{niut-ecmo.sltasb emlo}v
                                                   e d   i n t o   p r o d u c t - t r e<e/ Dbruotptdoonw
                                                   n M e/n/u Istuepmp>l
                                                   i e r s   m o v e d   i n t o   p)r)o}d
                                                   u c t - t r e e   ( עץ   מו צר )< /tDarbosp
                                                   d o wrneMteunrunC ointteemnst
                                                   >}
                                                   
                                                    
                                                    c o n s t   m o r e N<a/vDIrtoepmdso w=n M(e
                                                   n u >t
                                                   :   ( k :   s t r i n)g})
                                                     = >   s t r i n<g/,d
                                                   i v >u
                                                   s
                                                   e r R o l e :   s{t/r*i nשgפת, 
                                                   ממ שק  p+e rיצmיאsה ?—:  בפUינsה eהrשמPאלeיתr m*i/s}s
                                                   i o n s , 
                                                        i<sdSiyvs tcelmaOswsnNearm?e:= "bfoloelxe aint,e
                                                   m s -icseInmtpeerr sgoanpa-t1i"n>g
                                                   ? :   b o o l e a n 
                                                   <)B u=t>t o{n
                                                     
                                                         c o n s t   f u l l  v=a rhiaasnFtu=l"lgMheonsut("u
                                                   s e r R o l e ,   i s S yssitzeem=O"wsnme"r
                                                   ) 
                                                        c o n s t   i t eomnsC:l i{c ki=d{:o nsLtorgionugt;} 
                                                   l a b e l :   s t r i n gc;l aiscsoNna:m et=y"pteeoxft -Pparcikmaagrey -}f[o]r e=g r[o]u
                                                   n
                                                   d / 7i0f  h(oivseSry:stteexmtO-wpnreirm a&r&y -!fiosrIemgpreorusnodn ahtoivnegr): brge-tpurrinm airtye-mfso
                                                   r
                                                   e g r/o/u nבdעל/ים1 0בה"תח
                                                   זו ת  —   כפ תו ר  ח זר ה  ל>פא
                                                   נל   בע לי ם
                                                        i f   ( i s<SLyosgtOeumtO wcnlears s&N&a mies=I"mwp-e4r sho-n4a tmiln-g2)"  i/t>e
                                                   m s . p u s h ( {   i d :{ t"(a"dcmoimnm-opna.nleolg"o,u tl"a)b}e
                                                   l :   t ( " n a v . a<d/mBiuntPtaonne>l
                                                   " ) ,   i c o n :   S<hLiaenlgdu a}g)e
                                                   S
                                                   w i ticfh e(rf u/l>l
                                                     | |   u s e r C<a/ndSieve>(
                                                   p e r m s ,  <"/cdainvS>e
                                                   e P u r c<h/ansaevO>r
                                                   d e r)s
                                                   "})) items.push({ id: "purchase-orders", label: t("nav.purchaseOrders"), icon: ClipboardList })
                                                     if (full || userCanSee(perms, "canSeeUpload")) items.push({ id: "upload", label: t("nav.upload"), icon: Upload })
                                                     if (full || userCanSeeOptIn(perms, "canSeeReports")) items.push({ id: "reports", label: t("nav.reports"), icon: BarChart3 })
                                                     if (full || userCanSeeOptIn(perms, "canSeeSettings")) items.push({ id: "settings", label: t("nav.settings"), icon: Settings })
                                                     return items
                                                     }
                                                   
                                                   export function DesktopNav({ currentPage, setCurrentPage, currentRestaurant, restaurants, onSelectRestaurant, userRole, isSystemOwner, userPermissions, onLogout, isImpersonating, onStopImpersonate }: DesktopNavProps) {
                                                       const t = useTranslations()
                                                     return (
                                                       <nav className="hidden md:flex fixed top-0 inset-x-0 z-50 h-16 bg-primary text-primary-foreground border-b border-primary-foreground/10">
                                                             <div className="container mx-auto px-4 flex items-center justify-between">
                                                               {/* Logo */}
                                                                     <div className="flex items-center gap-8">
                                                                               <div className="flex items-center gap-3">
                                                                                           <div className="w-9 h-9 rounded-xl bg-primary-foreground/10 flex items-center justify-center">
                                                                                                         <UtensilsCrossed className="w-5 h-5" />
                                                                                             </div>div>
                                                                                           <span className="font-bold text-lg">Restaurant Pro</span>span>
                                                                               </div>div>
                                                                     
                                                                       {/* מסעדה — רק בהתחזה (בעלים) או למנהל/משתמש */}
                                                                       {(isImpersonating || !isSystemOwner) && restaurants.length > 0 && (
                                                      isImpersonating ? (
                                                                      <div className="flex items-center gap-2 h-9 px-3 bg-primary-foreground/10 rounded-full">
                                                                                      <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                                                                                      <span className="max-w-[120px] truncate font-medium">{currentRestaurant}</span>span>
                                                                        {onStopImpersonate && (
                                                                                          <button onClick={onStopImpersonate} title="חזור לפאנל בעלים" className="opacity-60 hover:opacity-100 transition-opacity text-xs leading-none">
                                                                                                              ✕
                                                                                            </button>button>
                                                                                      )}
                                                                      </div>div>
                                                                    ) : (
                                                                      <div className="flex items-center gap-2 h-9 px-3 bg-primary-foreground/10 rounded-full">
                                                                                      <div className="w-2 h-2 rounded-full bg-green-400" />
                                                                                      <span className="max-w-[140px] truncate font-medium">{currentRestaurant}</span>span>
                                                                      </div>div>
                                                                    )
                                                    )}
                                                                     </div>div>
                                                             
                                                               {/* Nav Items */}
                                                                     <div className="flex items-center gap-1">
                                                                       {mainNavItems(t, userRole, userPermissions, isSystemOwner, isImpersonating).map((item) => (
                                                      <button
                                                                      key={item.id}
                                                                      type="button"
                                                                      onClick={() => setCurrentPage(item.id)}
                                                                      className={cn(
                                                                                        "flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-all",
                                                                                        currentPage === item.id
                                                                                          ? "bg-primary-foreground/20 text-primary-foreground"
                                                                                          : "text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                                                                                      )}
                                                                    >
                                                                    <item.icon className="w-4 h-4" />
                                                        {item.label}
                                                      </button>button>
                                                    ))}
                                                                     
                                                                       {moreNavItems(t, userRole, userPermissions, isSystemOwner, isImpersonating).length > 0 && (
                                                      <DropdownMenu modal={false}>
                                                                    <DropdownMenuTrigger asChild>
                                                                                    <Button
                                                                                                        variant="ghost"
                                                                                                        className={cn(
                                                                                                                              "h-9 px-3 gap-2 rounded-full",
                                                                                                                              moreNavItems(t, userRole, userPermissions, isSystemOwner, isImpersonating).some((i) => i.id === currentPage)
                                                                                                                                ? "bg-primary-foreground/20 text-primary-foreground"
                                                                                                                                : "text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                                                                                                                            )}
                                                                                                      >
                                                                                                      <Menu className="w-4 h-4" />
                                                                                      {t("common.more")}
                                                                                                      <ChevronDown className="w-4 h-4 opacity-60" />
                                                                                      </Button>Button>
                                                                    </DropdownMenuTrigger>DropdownMenuTrigger>
                                                                    <DropdownMenuContent align="end" className="w-48">
                                                                      {moreNavItems(t, userRole, userPermissions, isSystemOwner, isImpersonating).map((item) => (
                                                                          <DropdownMenuItem
                                                                                                key={item.id}
                                                                                                onSelect={() => setCurrentPage(item.id)}
                                                                                                className={cn(
                                                                                                                        "gap-2 cursor-pointer",
                                                                                                                        currentPage === item.id && "bg-accent text-accent-foreground"
                                                                                                                      )}
                                                                                              >
                                                                                              <item.icon className="w-4 h-4" />
                                                                            {item.label}
                                                                          </DropdownMenuItem>DropdownMenuItem>
                                                                        ))}
                                                                    </DropdownMenuContent>DropdownMenuContent>
                                                      </DropdownMenu>DropdownMenu>
                                                                               )}
                                                                     </div>div>
                                                             
                                                               {/* שפת ממשק + יציאה — בפינה השמאלית */}
                                                                     <div className="flex items-center gap-1">
                                                                               <Button
                                                                                             variant="ghost"
                                                                                             size="sm"
                                                                                             onClick={onLogout}
                                                                                             className="text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                                                                                           >
                                                                                           <LogOut className="w-4 h-4 ml-2" />
                                                                                 {t("common.logout")}
                                                                               </Button>Button>
                                                                               <LanguageSwitcher />
                                                                     </div>div>
                                                             </div>div>
                                                       </nav>nav>
                                                     )
                                                     }</nav>
