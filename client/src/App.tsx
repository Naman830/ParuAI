import { Routes, Route, useLocation } from "react-router-dom";
import Home from "@/pages/Home";
import Projects from "@/pages/Projects";
import MyProjects from "@/pages/MyProjects";
import Preview from "@/pages/Preview";
import Pricing from "@/pages/Pricing";
import Community from "@/pages/Community";
import View from "@/pages/View";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Toaster } from "@/components/ui/sonner"
import AuthPage from "./pages/auth/AuthPage";
import Settings from "./pages/Settings";
import ContactForm from "./pages/Contact";
import { AuthStatusToasts } from "@/components/AuthStatusToasts";

const App = () => {
  const { pathname } = useLocation();

  const hideNavbar =
    (pathname.startsWith("/projects/") && pathname !== "/projects") ||
    pathname.startsWith("/view/") ||
    pathname.startsWith("/preview/");

  const hideFooter =
    (pathname.startsWith("/projects/") && pathname !== "/projects") ||
    pathname.startsWith("/view/") ||
    pathname.startsWith("/preview/");
  return (
    <div>
       <Toaster />
      {/* Above <Routes> so it fires on whatever route an auth redirect lands on. */}
      <AuthStatusToasts />
      {!hideNavbar && <Navbar />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/projects/:projectId" element={<Projects />} />
        <Route path="/projects" element={<MyProjects />} />
        <Route path="/preview/:projectId" element={<Preview />} />
        <Route path="/preview/:projectId/:version" element={<Preview />} />
        <Route path="/community" element={<Community />} />
        <Route path="/view/:projectId" element={<View />} />
        <Route path="/auth/:pathname" element={<AuthPage />} />
        <Route path="/account/settings" element={<Settings />} />
        <Route path="/contact" element={<ContactForm />} />
      </Routes>
      {!hideFooter && <Footer />}
    </div>
  );
};

export default App;
