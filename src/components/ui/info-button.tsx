import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const InfoButton = () => (
  <Popover>
    <PopoverTrigger asChild>
      <button
        type="button"
        aria-label="About this app"
        className="fixed bottom-4 right-4 z-50 h-10 w-10 rounded-full bg-primary/10 hover:bg-primary/20 border border-primary/30 backdrop-blur flex items-center justify-center text-primary shadow-md transition-colors"
      >
        <Info className="h-5 w-5" />
      </button>
    </PopoverTrigger>
    <PopoverContent side="top" align="end" className="max-w-xs text-sm leading-relaxed">
      <p className="font-semibold mb-1">ASD Benchmark Portal</p>
      <p className="text-muted-foreground">
        Developed by Hridansh Kumar, Abdul Rahman Riaz Ahamed, Adityansu Pattanaik and Rishabh Agarwal.
      </p>
    </PopoverContent>
  </Popover>
);
