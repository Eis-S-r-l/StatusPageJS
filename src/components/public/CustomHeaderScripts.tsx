import Script, { type ScriptProps } from "next/script";

import { safeParseHeaderScripts, scriptProps } from "@/modules/appearance/header-scripts";

export function CustomHeaderScripts({ value }: { value: string }) {
  return safeParseHeaderScripts(value).map((definition, index) => {
    const parsedProps = scriptProps(definition);
    const { id: configuredId, src, ...forwardedAttributes } = parsedProps;
    const id = configuredId ?? `eis-custom-header-script-${index + 1}`;
    const key = `${id}-${index}`;
    const attributes: ScriptProps = { ...forwardedAttributes, id, strategy: "beforeInteractive" };

    if (src) {
      return <Script key={key} {...attributes} src={src} />;
    }
    return <Script key={key} {...attributes} dangerouslySetInnerHTML={{ __html: definition.content }} />;
  });
}
