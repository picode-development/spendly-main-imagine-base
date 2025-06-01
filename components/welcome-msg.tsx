"use client";

import { useUser, UserButton } from "@clerk/nextjs";
import { useMedia } from "react-use";

export const WelcomeMsg = () => {
  const { user, isLoaded } = useUser();
  const isMobile = useMedia("(max-width: 1024px)", false);

  return (
    <div className="space-y-1 mb-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl lg:text-4xl text-white font-medium">
          Welcome Back{isLoaded ? ", " : " "} {user?.firstName}.
        </h2>
      </div>
      <p className="text-sm lg:text-base text-[#89b6fd]">
        This is your Financial Overview Report.
      </p>
    </div>
  );
};
