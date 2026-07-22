import { X } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  ElementUpdate,
  SelectedElement,
  SelectedElementStyles,
} from "../../types";

interface EditorPanelProps {
  selectedElement: SelectedElement | null;
  onUpdate: (updates: ElementUpdate) => void;
  onClose: () => void;
}

const EditorPanel = ({
  selectedElement,
  onUpdate,
  onClose,
}: EditorPanelProps) => {
  const [values, setValues] = useState(selectedElement);

  useEffect(() => {
    setValues(selectedElement);
  }, [selectedElement]);

  if (!selectedElement || !values) return null;

  // handlechnage
  const handleChange = (field: "text" | "className", value: string) => {
    setValues({ ...values, [field]: value });
    onUpdate({ [field]: value });
  };

  const handleStyleChange = (
    styleName: keyof SelectedElementStyles,
    value: string,
  ) => {
    const newStyles = { ...values.styles, [styleName]: value };
    setValues({ ...values, styles: newStyles });

    onUpdate({ styles: { [styleName]: value } });
  };

  return (
    <div className="absolute top-4 right-4 w-80 bg-[#18181B]/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-[#27272A] p-5 z-50 animate-fade-in">
      <div className="relative flex justify-between items-center mb-5">
        <h3 className="font-semibold text-[#FAFAFA] text-sm tracking-tight">Edit Element</h3>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition"
        >
          <X className="w-4 h-4 text-[#A1A1AA]" />
        </button>
      </div>
      <div className="relative space-y-5 text-white">
        {/* TEXT CONTENT */}
        <div>
          <label className="block text-xs text-[#A1A1AA] mb-1">
            Text Content
          </label>
          <textarea
            value={values.text}
            onChange={(e) => handleChange("text", e.target.value)}
            className="w-full text-sm p-2.5 bg-[#09090B] border border-[#27272A] rounded-xl focus:ring-1 focus:ring-[#7C3AED] outline-none min-h-20 transition"
          />
        </div>
        {/* CLASS NAME */}
        <div>
          <label className="block text-xs text-[#A1A1AA] mb-1">
            Class Name
          </label>
          <input
            type="text"
            value={values.className || ""}
            onChange={(e) => handleChange("className", e.target.value)}
            className="w-full text-sm p-2.5 bg-[#09090B] border border-[#27272A] rounded-xl focus:ring-1 focus:ring-[#7C3AED] outline-none transition"
          />
        </div>
        {/* STYLES  */}
        <div className="grid grid-cols-2 gap-3">
          {/* Padding */}
          <div>
            <label className="block text-xs text-[#A1A1AA] mb-1">
              Padding
            </label>
            <input
              type="text"
              value={values.styles?.padding || ""}
              onChange={(e) => handleStyleChange("padding", e.target.value)}
              className="w-full text-sm p-2.5 bg-[#09090B] border border-[#27272A] rounded-xl focus:ring-1 focus:ring-[#7C3AED] outline-none transition"
            />
          </div>
          {/* Margin */}
          <div>
            <label className="block text-xs text-[#A1A1AA] mb-1">
              Margin
            </label>
            <input
              type="text"
              value={values.styles.margin}
              onChange={(e) => handleStyleChange("margin", e.target.value)}
              className="w-full text-sm p-2.5 bg-[#09090B] border border-[#27272A] rounded-xl focus:ring-1 focus:ring-[#7C3AED] outline-none transition"
            />
          </div>
        </div>
        {/* FONT SIZE */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[#A1A1AA] mb-1">
              Font Size
            </label>
            <input
              type="text"
              value={values.styles.fontSize}
              onChange={(e) => handleStyleChange("fontSize", e.target.value)}
              className="w-full text-sm p-2.5 bg-[#09090B] border border-[#27272A] rounded-xl focus:ring-1 focus:ring-[#7C3AED] outline-none transition"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {/* BACKGROUND */}
          <div>
            <label className="block text-xs text-[#A1A1AA] mb-1">
              Background
            </label>
            <div className="flex items-center gap-2 bg-[#09090B] border border-[#27272A] rounded-xl px-2 py-1.5">
              <input
                type="color"
                value={
                  values.styles.backgroundColor === "rgba(0, 0, 0, 0)"
                    ? "#ffffff"
                    : values.styles.backgroundColor
                }
                onChange={(e) =>
                  handleStyleChange("backgroundColor", e.target.value)
                }
                className="w-6 h-6 cursor-pointer border-none p-0 "
              />
              <span className="text-xs text-[#A1A1AA] truncate">
                {values.styles.backgroundColor}
              </span>
            </div>
          </div>
          {/* TEXT COLOR */}
          <div>
            <label className="block text-xs text-[#A1A1AA] mb-1">
              Text Color
            </label>
            <div className="flex items-center gap-2 bg-[#09090B] border border-[#27272A] rounded-xl px-2 py-1.5">
              <input
                type="color"
                value={values.styles.color}
                onChange={(e) => handleStyleChange("color", e.target.value)}
                className="w-6 h-6 cursor-pointer border-none p-0 bg-transparent"
              />
              <span className="text-xs text-[#A1A1AA] truncate">
                {values.styles.color}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditorPanel;