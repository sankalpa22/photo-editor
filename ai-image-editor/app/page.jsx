"use client";

import FeaturesSection from "@/components/features";


import { Button } from "@/components/ui/button";
import Link from "next/link";
import React, { useState, useEffect } from "react";

// Hero Section Component
const HeroSection = () => {
  const [textVisible, setTextVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTextVisible(true), 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <div className="text-center z-10 px-6">
        <div
          className={`transition-all duration-1000 ${textVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}
        >
          <h1 className="text-5xl md:text-7xl font-black mb-6 tracking-tight leading-tight text-foreground">
            <span className="bg-gradient-to-r from-primary to-sky-600 bg-clip-text text-transparent">
              Create
            </span>
            <br />
            <span>Without Limits</span>
          </h1>


          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center mb-14">
            <Link href="/dashboard">
              <Button variant="primary" size="lg">
                Start Creating Free
              </Button>
            </Link>
          </div>
        </div>

        {/* Removed 3D Demo Interface */}
      </div>
    </section>
  );
};

// Main App Component
const App = () => {
  return (
    <div className="pt-36">
      <HeroSection />

      <FeaturesSection />


    </div>
  );
};

export default App;
