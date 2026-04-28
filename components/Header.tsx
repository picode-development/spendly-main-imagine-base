  "use client";

  import { HeaderLogo } from "@/components/header-logo";
  import { Navigation } from "@/components/navigation";
  import { UserButton, ClerkLoading, ClerkLoaded } from "@clerk/nextjs";
  import { Loader2 } from "lucide-react";
  import { WelcomeMsg } from "@/components/welcome-msg";
  import { Filters } from "./filters";
  import { useMedia } from "react-use";
  import { AddNewDropdown } from "./add-new-dropdown";

  export const Header = () => {
    const isDesktop = useMedia("(min-width: 1024px)", false);

    return (
      <header className="bg-[linear-gradient(to_bottom,var(--header-gradient-from),var(--header-gradient-to))] px-4 pt-15 lg:pt-8 lg:px-14 pb-36">
        <div className="max-w-screen-2xl mx-auto">
          <div
            className={`w-full flex items-center justify-between ${
              isDesktop ? "mb-14" : "mb-4"
            }`}
          >
            <div className="flex items-center lg:gap-x-16">
              <HeaderLogo />
              <Navigation />
            </div>

            {isDesktop && (
              <div className="flex items-center gap-4">
                <AddNewDropdown />
                <ClerkLoaded>
                  <UserButton />
                </ClerkLoaded>
                <ClerkLoading>
                  <Loader2 className="size-8 animate-spin text-slate-400" />
                </ClerkLoading>
              </div>
            )}
          </div>

          <WelcomeMsg />
          <Filters />
        </div>
      </header>
    );
  };
