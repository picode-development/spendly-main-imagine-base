import { AccountFIlter } from "./accounts-filter";
import { AllDateFilter } from "./all-date-filters";
import { CategoryFilter } from "./category-filter";
import { DateFilter } from "./date-filter";

export const Filters = () => {
    return (
        <div className="flex flex-col lg:flex-row lg:items-center gap-2">
            <AccountFIlter />
            <CategoryFilter />
            <div className="flex flex-row gap-2 w-full lg:w-auto">
                <div className="flex-[2] lg:flex-none">
                    <DateFilter />
                </div>
                <div className="flex-[1] lg:flex-none">
                    <AllDateFilter />
                </div>
            </div>
        </div>
    );
};