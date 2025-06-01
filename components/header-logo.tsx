import Link from "next/link";
import Image from "next/image";

export const HeaderLogo = () => {
    return (
        <Link href="/">
            <div className="items-center hidden lg:flex">
                <Image src="./White-Larger-Logo.svg" alt="Logo" height={48} width={48}/>
                <p className="font-bold text-white text-2xl ml-0.5">
                    Spendly
                </p>
            </div>
        </Link>
    );
};