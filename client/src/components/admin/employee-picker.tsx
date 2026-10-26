import { useId, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import type { User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

type EmployeePickerProps = {
  employees: User[];
  value?: string;
  onValueChange: (id: string) => void;
  allowNone?: boolean;
  disabled?: boolean;
  testId: string;
};

export function EmployeePicker({
  employees, value = "", onValueChange, allowNone = false, disabled, testId,
}: EmployeePickerProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const selected = employees.find((employee) => employee.id === value);

  const select = (id: string) => {
    setOpen(false);
    onValueChange(id);
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label="Velg ansatt"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          disabled={disabled}
          className="w-full justify-between gap-2 font-normal"
          data-testid={testId}
        >
          <span className="truncate">
            {selected ? `${selected.name} (${selected.region})` : allowNone ? "Ingen" : "Velg ansatt..."}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput
            placeholder="Søk på navn, region, telefon eller ansattnr..."
            aria-label="Søk etter ansatt"
            data-testid={`${testId}-search`}
          />
          <CommandList id={listId} className="max-h-60">
            <CommandEmpty>Ingen ansatte funnet.</CommandEmpty>
            <CommandGroup>
              {allowNone && (
                <CommandItem value="Ingen" onSelect={() => select("")}>
                  <Check className={cn("mr-2 h-4 w-4", value ? "opacity-0" : "opacity-100")} />
                  Ingen
                </CommandItem>
              )}
              {employees.map((employee) => (
                <CommandItem
                  key={employee.id}
                  value={employee.id}
                  keywords={[employee.name, employee.region, employee.phone ?? "", String(employee.externalId ?? "")]}
                  onSelect={() => select(employee.id)}
                  className="min-h-10"
                  data-testid={`${testId}-option-${employee.id}`}
                >
                  <Check className={cn("mr-2 h-4 w-4 shrink-0", value === employee.id ? "opacity-100" : "opacity-0")} />
                  <span>{employee.name} <span className="text-muted-foreground">({employee.region})</span></span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
