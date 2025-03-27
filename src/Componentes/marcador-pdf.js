import React, { useState, useRef } from "react";
import { PDFDocument, rgb } from "pdf-lib";
import { saveAs } from "file-saver";
import * as pdfjsLib from "pdfjs-dist/build/pdf";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.entry";

// Configura o worker do pdfjs
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export default function MarcadorPDF() {
  const [file, setFile] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null); // pdf-lib para edição
  const [pdfJsDoc, setPdfJsDoc] = useState(null); // pdfjs para renderização e busca
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]); // Array de { pageNum, rects: [{ x, y, width, height }] }
  const canvasContainerRef = useRef(null);
  const scale = 1.5; // fator de escala usado para renderização

  // Carrega o arquivo e renderiza cada página com pdfjs
  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);

      // Ler arquivo com FileReader para pdfjs
      const fileReader = new FileReader();
      fileReader.onload = async function () {
        const typedarray = new Uint8Array(this.result);
        const loadingTask = pdfjsLib.getDocument({ data: typedarray });
        const pdf = await loadingTask.promise;
        setPdfJsDoc(pdf);
        // Limpa o container
        if (canvasContainerRef.current) {
          canvasContainerRef.current.innerHTML = "";
        }
        // Renderiza cada página
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.marginBottom = "10px";
          // Adiciona o canvas no container
          canvasContainerRef.current.appendChild(canvas);
          const context = canvas.getContext("2d");
          await page.render({ canvasContext: context, viewport }).promise;
        }
      };
      fileReader.readAsArrayBuffer(selectedFile);

      // Carrega o PDF com pdf-lib para futuras manipulações (salvar com marcações)
      const arrayBuffer = await selectedFile.arrayBuffer();
      const loadedPdfDoc = await PDFDocument.load(arrayBuffer);
      setPdfDoc(loadedPdfDoc);

      // Limpa resultados de pesquisa anteriores
      setSearchResults([]);
    }
  };

  // Ao pressionar Enter, pesquisa o termo nas páginas
  const handleKeyPress = async (e) => {
    if (e.key === "Enter" && pdfJsDoc) {
      await handleSearch();
    }
  };

  // Pesquisa o termo em cada página usando pdfjs
  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    const results = [];
    // Para cada página do pdfJsDoc
    for (let pageNum = 1; pageNum <= pdfJsDoc.numPages; pageNum++) {
      const page = await pdfJsDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const textContent = await page.getTextContent();
      const rects = [];
      // Para cada item de texto, se contiver o termo (case-insensitive)
      textContent.items.forEach((item) => {
        if (item.str.toLowerCase().includes(searchTerm.toLowerCase())) {
          // Converte a posição usando o viewport
          const [vx, vy] = viewport.convertToViewportPoint(
            item.transform[4],
            item.transform[5]
          );
          // Aproximação do retângulo – pode ser ajustada conforme necessário
          rects.push({
            x: vx,
            y: vy - item.height * scale, // ajusta para a altura do item
            width: item.width * scale,
            height: item.height * scale,
          });
        }
      });
      results.push({ pageNum, rects });
    }
    // Se não encontrar nenhum resultado, avisa o usuário
    const totalMatches = results.reduce(
      (acc, cur) => acc + cur.rects.length,
      0
    );
    if (totalMatches === 0) {
      alert("Nenhuma ocorrência encontrada para o termo de busca.");
      setSearchResults([]);
      return;
    }
    setSearchResults(results);
    updateCanvasHighlights(results);
  };

  // Desenha os destaques sobre os canvas renderizados
  const updateCanvasHighlights = (results) => {
    results.forEach((result) => {
      // Cada canvas corresponde a uma página (ordem de inserção)
      const canvas = canvasContainerRef.current.children[result.pageNum - 1];
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      // Desenha um retângulo semi-transparente para cada ocorrência
      result.rects.forEach((rect) => {
        ctx.fillStyle = "rgba(255,255,0,0.5)";
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      });
    });
  };

  // Ao salvar, adiciona os destaques no PDF usando pdf-lib
  const savePDFWithHighlights = async () => {
    if (!pdfDoc || searchResults.length === 0 || !pdfJsDoc) return;
    try {
        const yellowColor = rgb(1, 1, 0);
        for (let pageIndex = 0; pageIndex < pdfDoc.getPageCount(); pageIndex++) {
            const page = pdfDoc.getPages()[pageIndex];
            const { width, height } = page.getSize();
            console.log(`Page ${pageIndex + 1} dimensions: width=${width}, height=${height}`);
            const result = searchResults.find((r) => r.pageNum === pageIndex + 1);
            if (result) {
                result.rects.forEach((rect) => {
                    const newX = parseFloat((rect.x / scale).toFixed(2));
                    const newY = parseFloat((height - ((rect.y + rect.height) / scale)).toFixed(2));
                    const newWidth = parseFloat((rect.width / scale).toFixed(2));
                    const newHeight = parseFloat((rect.height / scale).toFixed(2));

                    console.log(`Page ${pageIndex + 1}: x=${newX}, y=${newY}, width=${newWidth}, height=${newHeight}`);

                    page.drawRectangle({
                        x: newX,
                        y: newY,
                        width: newWidth,
                        height: newHeight,
                        color: yellowColor,
                        opacity: 0.5,
                    });
                });
            }
            //teste de retangulo fixo.
            page.drawRectangle({
                    x: 100,
                    y: 100,
                    width: 50,
                    height: 50,
                    color: rgb(1, 0, 0),
                    opacity: 0.5,
                });
        }
        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        saveAs(blob, "marcado.pdf");
    } catch (error) {
        console.error("Erro ao salvar PDF:", error);
        alert("Erro ao salvar PDF. Verifique o arquivo e tente novamente.");
    }
};

  return (
    <div className="p-4">
      <input type="file" accept="application/pdf" onChange={handleFileChange} />
      {file && (
        <>
          <div style={{ marginTop: "10px" }}>
            <input
              type="text"
              placeholder="Digite o termo de busca e pressione Enter"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyPress={handleKeyPress}
              className="border p-2 mx-2"
            />
            <button
              onClick={savePDFWithHighlights}
              className="bg-red-500 text-white px-4 py-2 ml-2"
            >
              Salvar PDF com Destaques
            </button>
          </div>
          <div ref={canvasContainerRef} style={{ marginTop: "20px" }}></div>
        </>
      )}
    </div>
  );
}
