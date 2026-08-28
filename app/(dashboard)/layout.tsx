import { Header } from "@/components/Header";
import { WidgetDeepLinks } from "@/components/widget-deep-links";
import { OfflineBadge } from "@/components/offline-badge";
import { SwCacheGuard } from "@/components/sw-cache-guard";
import { PrefetchCommonData } from "@/components/prefetch-common-data";

type Props = {
    children: React.ReactNode;
};

const DashboardLayout = ({ children }: Props) =>  {
    return (
        <>
            <WidgetDeepLinks />
            <SwCacheGuard />
            <OfflineBadge />
            <PrefetchCommonData />
            <Header />
            <main className="px-3 lg:px-14">
             {children}
            </main>
        </>
    );
};

export default DashboardLayout;