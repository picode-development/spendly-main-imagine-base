export const dynamic = 'force-dynamic';
import { Header } from "@/components/Header";
import { WidgetDeepLinks } from "@/components/widget-deep-links";

type Props = {
    children: React.ReactNode;
};

const DashboardLayout = ({ children }: Props) =>  {
    return (
        <>
            <WidgetDeepLinks />
            <Header />
            <main className="px-3 lg:px-14">
             {children}
            </main>
        </>
    );
};

export default DashboardLayout;