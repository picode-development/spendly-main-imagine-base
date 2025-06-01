import { AccountFIlter } from "./accounts-filter";
import { AllDateFilter } from "./all-date-filters";
import { DateFilter } from "./date-filter";

export const Filters = () => {
    return (
        <div className="flex flex-col lg:flex-row items-center gap-2">
            <AccountFIlter />
            <div className="flex flex-col lg:flex-row gap-2 w-full">
                <DateFilter />
                <AllDateFilter />
            </div>
        </div>
    );
};
