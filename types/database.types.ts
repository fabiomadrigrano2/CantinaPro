export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      cantinas: {
        Row: {
          id: string;
          nome: string;
          escola: string | null;
          cidade: string | null;
          estado: string | null;
          telefone: string | null;
          email: string;
          logo_url: string | null;
          plano: Database["public"]["Enums"]["plano_tipo"];
          assinatura: Database["public"]["Enums"]["assinatura_status"];
          trial_fim: string | null;
          assinatura_fim: string | null;
          limite_alunos: number;
          permite_fiado: boolean | null;
          limite_fiado: number | null;
          notif_saldo_min: number | null;
          pix_chave: string | null;
          pix_tipo: string | null;
          pix_nome: string | null;
          whatsapp_numero: string | null;
          dia_cobranca_mensal: number | null;
          ativo: boolean | null;
          criado_em: string | null;
          atualizado_em: string | null;
        };
        Insert: {
          id?: string;
          nome: string;
          escola?: string | null;
          cidade?: string | null;
          estado?: string | null;
          telefone?: string | null;
          email: string;
          logo_url?: string | null;
          plano?: Database["public"]["Enums"]["plano_tipo"];
          assinatura?: Database["public"]["Enums"]["assinatura_status"];
          trial_fim?: string | null;
          assinatura_fim?: string | null;
          limite_alunos?: number;
          permite_fiado?: boolean | null;
          limite_fiado?: number | null;
          notif_saldo_min?: number | null;
          pix_chave?: string | null;
          pix_tipo?: string | null;
          pix_nome?: string | null;
          whatsapp_numero?: string | null;
          dia_cobranca_mensal?: number | null;
          ativo?: boolean | null;
          criado_em?: string | null;
          atualizado_em?: string | null;
        };
        Update: {
          id?: string;
          nome?: string;
          escola?: string | null;
          cidade?: string | null;
          estado?: string | null;
          telefone?: string | null;
          email?: string;
          logo_url?: string | null;
          plano?: Database["public"]["Enums"]["plano_tipo"];
          assinatura?: Database["public"]["Enums"]["assinatura_status"];
          trial_fim?: string | null;
          assinatura_fim?: string | null;
          limite_alunos?: number;
          permite_fiado?: boolean | null;
          limite_fiado?: number | null;
          notif_saldo_min?: number | null;
          pix_chave?: string | null;
          pix_tipo?: string | null;
          pix_nome?: string | null;
          whatsapp_numero?: string | null;
          dia_cobranca_mensal?: number | null;
          ativo?: boolean | null;
          criado_em?: string | null;
          atualizado_em?: string | null;
        };
        Relationships: [];
      };
      perfis: {
        Row: {
          id: string;
          cantina_id: string | null;
          nome: string;
          role: string;
          criado_em: string | null;
        };
        Insert: {
          id: string;
          cantina_id?: string | null;
          nome: string;
          role?: string;
          criado_em?: string | null;
        };
        Update: {
          id?: string;
          cantina_id?: string | null;
          nome?: string;
          role?: string;
          criado_em?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "perfis_cantina_id_fkey";
            columns: ["cantina_id"];
            referencedRelation: "cantinas";
            referencedColumns: ["id"];
          }
        ];
      };
      turmas: {
        Row: {
          id: string;
          cantina_id: string;
          nome: string;
          criado_em: string | null;
        };
        Insert: {
          id?: string;
          cantina_id: string;
          nome: string;
          criado_em?: string | null;
        };
        Update: {
          id?: string;
          cantina_id?: string;
          nome?: string;
          criado_em?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "turmas_cantina_id_fkey";
            columns: ["cantina_id"];
            referencedRelation: "cantinas";
            referencedColumns: ["id"];
          }
        ];
      };
      categorias: {
        Row: {
          id: string;
          cantina_id: string;
          nome: string;
          icone: string | null;
          ordem: number | null;
        };
        Insert: {
          id?: string;
          cantina_id: string;
          nome: string;
          icone?: string | null;
          ordem?: number | null;
        };
        Update: {
          id?: string;
          cantina_id?: string;
          nome?: string;
          icone?: string | null;
          ordem?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "categorias_cantina_id_fkey";
            columns: ["cantina_id"];
            referencedRelation: "cantinas";
            referencedColumns: ["id"];
          }
        ];
      };
      produtos: {
        Row: {
          id: string;
          cantina_id: string;
          categoria_id: string | null;
          categoria: string | null;
          emoji: string | null;
          nome: string;
          descricao: string | null;
          preco: number;
          foto_url: string | null;
          disponivel: boolean | null;
          estoque: number | null;
          estoque_minimo: number;
          criado_em: string | null;
        };
        Insert: {
          id?: string;
          cantina_id: string;
          categoria_id?: string | null;
          categoria?: string | null;
          emoji?: string | null;
          nome: string;
          descricao?: string | null;
          preco: number;
          foto_url?: string | null;
          disponivel?: boolean | null;
          estoque?: number | null;
          estoque_minimo?: number;
          criado_em?: string | null;
        };
        Update: {
          id?: string;
          cantina_id?: string;
          categoria_id?: string | null;
          categoria?: string | null;
          emoji?: string | null;
          nome?: string;
          descricao?: string | null;
          preco?: number;
          foto_url?: string | null;
          disponivel?: boolean | null;
          estoque?: number | null;
          estoque_minimo?: number;
          criado_em?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "produtos_cantina_id_fkey";
            columns: ["cantina_id"];
            referencedRelation: "cantinas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "produtos_categoria_id_fkey";
            columns: ["categoria_id"];
            referencedRelation: "categorias";
            referencedColumns: ["id"];
          }
        ];
      };
      alunos: {
        Row: {
          id: string;
          cantina_id: string;
          turma_id: string | null;
          turma: string | null;
          nome: string;
          matricula: string | null;
          foto_url: string | null;
          ativo: boolean | null;
          conta_paga: boolean;
          criado_em: string | null;
          saldo: number | null;
          tipo_conta: string | null;
          ciclo_cobranca: string | null;
          dia_cobranca: number | null;
          limite_diario: number | null;
          telefone_responsavel: string | null;
          email_responsavel: string | null;
          nome_responsavel: string | null;
        };
        Insert: {
          id?: string;
          cantina_id: string;
          turma_id?: string | null;
          turma?: string | null;
          nome: string;
          matricula?: string | null;
          foto_url?: string | null;
          ativo?: boolean | null;
          conta_paga?: boolean;
          criado_em?: string | null;
          saldo?: number | null;
          tipo_conta?: string | null;
          ciclo_cobranca?: string | null;
          dia_cobranca?: number | null;
          limite_diario?: number | null;
          telefone_responsavel?: string | null;
          email_responsavel?: string | null;
          nome_responsavel?: string | null;
        };
        Update: {
          id?: string;
          cantina_id?: string;
          turma_id?: string | null;
          turma?: string | null;
          nome?: string;
          matricula?: string | null;
          foto_url?: string | null;
          ativo?: boolean | null;
          conta_paga?: boolean;
          criado_em?: string | null;
          saldo?: number | null;
          tipo_conta?: string | null;
          ciclo_cobranca?: string | null;
          dia_cobranca?: number | null;
          limite_diario?: number | null;
          telefone_responsavel?: string | null;
          email_responsavel?: string | null;
          nome_responsavel?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "alunos_cantina_id_fkey";
            columns: ["cantina_id"];
            referencedRelation: "cantinas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "alunos_turma_id_fkey";
            columns: ["turma_id"];
            referencedRelation: "turmas";
            referencedColumns: ["id"];
          }
        ];
      };
      responsaveis: {
        Row: {
          id: string;
          cantina_id: string;
          user_id: string | null;
          nome: string;
          email: string | null;
          celular: string | null;
          whatsapp: string | null;
          push_token: string | null;
          ciclo_cobranca: Database["public"]["Enums"]["ciclo_cobranca"];
          dia_cobranca: number | null;
          recebe_cobranca_whatsapp: boolean | null;
          recebe_notif_consumo: boolean | null;
          criado_em: string | null;
        };
        Insert: {
          id?: string;
          cantina_id: string;
          user_id?: string | null;
          nome: string;
          email?: string | null;
          celular?: string | null;
          whatsapp?: string | null;
          push_token?: string | null;
          ciclo_cobranca?: Database["public"]["Enums"]["ciclo_cobranca"];
          dia_cobranca?: number | null;
          recebe_cobranca_whatsapp?: boolean | null;
          recebe_notif_consumo?: boolean | null;
          criado_em?: string | null;
        };
        Update: {
          id?: string;
          cantina_id?: string;
          user_id?: string | null;
          nome?: string;
          email?: string | null;
          celular?: string | null;
          whatsapp?: string | null;
          push_token?: string | null;
          ciclo_cobranca?: Database["public"]["Enums"]["ciclo_cobranca"];
          dia_cobranca?: number | null;
          recebe_cobranca_whatsapp?: boolean | null;
          recebe_notif_consumo?: boolean | null;
          criado_em?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "responsaveis_cantina_id_fkey";
            columns: ["cantina_id"];
            referencedRelation: "cantinas";
            referencedColumns: ["id"];
          }
        ];
      };
      aluno_responsavel: {
        Row: {
          aluno_id: string;
          responsavel_id: string;
          parentesco: string | null;
        };
        Insert: {
          aluno_id: string;
          responsavel_id: string;
          parentesco?: string | null;
        };
        Update: {
          aluno_id?: string;
          responsavel_id?: string;
          parentesco?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "aluno_responsavel_aluno_id_fkey";
            columns: ["aluno_id"];
            referencedRelation: "alunos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "aluno_responsavel_responsavel_id_fkey";
            columns: ["responsavel_id"];
            referencedRelation: "responsaveis";
            referencedColumns: ["id"];
          }
        ];
      };
      contas: {
        Row: {
          id: string;
          cantina_id: string;
          aluno_id: string;
          tipo: Database["public"]["Enums"]["conta_tipo"];
          saldo: number;
          limite_fiado: number | null;
          atualizado_em: string | null;
        };
        Insert: {
          id?: string;
          cantina_id: string;
          aluno_id: string;
          tipo?: Database["public"]["Enums"]["conta_tipo"];
          saldo?: number;
          limite_fiado?: number | null;
          atualizado_em?: string | null;
        };
        Update: {
          id?: string;
          cantina_id?: string;
          aluno_id?: string;
          tipo?: Database["public"]["Enums"]["conta_tipo"];
          saldo?: number;
          limite_fiado?: number | null;
          atualizado_em?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "contas_cantina_id_fkey";
            columns: ["cantina_id"];
            referencedRelation: "cantinas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contas_aluno_id_fkey";
            columns: ["aluno_id"];
            referencedRelation: "alunos";
            referencedColumns: ["id"];
          }
        ];
      };
      limites_aluno: {
        Row: {
          id: string;
          cantina_id: string;
          aluno_id: string;
          limite_valor_diario: number | null;
          dias_permitidos: number[] | null;
          configurado_por: string | null;
          ativo: boolean | null;
          criado_em: string | null;
          atualizado_em: string | null;
        };
        Insert: {
          id?: string;
          cantina_id: string;
          aluno_id: string;
          limite_valor_diario?: number | null;
          dias_permitidos?: number[] | null;
          configurado_por?: string | null;
          ativo?: boolean | null;
          criado_em?: string | null;
          atualizado_em?: string | null;
        };
        Update: {
          id?: string;
          cantina_id?: string;
          aluno_id?: string;
          limite_valor_diario?: number | null;
          dias_permitidos?: number[] | null;
          configurado_por?: string | null;
          ativo?: boolean | null;
          criado_em?: string | null;
          atualizado_em?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "limites_aluno_cantina_id_fkey";
            columns: ["cantina_id"];
            referencedRelation: "cantinas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "limites_aluno_aluno_id_fkey";
            columns: ["aluno_id"];
            referencedRelation: "alunos";
            referencedColumns: ["id"];
          }
        ];
      };
      limites_aluno_produtos: {
        Row: {
          id: string;
          cantina_id: string;
          aluno_id: string;
          produto_id: string;
          qtd_maxima: number | null;
          criado_em: string | null;
        };
        Insert: {
          id?: string;
          cantina_id: string;
          aluno_id: string;
          produto_id: string;
          qtd_maxima?: number | null;
          criado_em?: string | null;
        };
        Update: {
          id?: string;
          cantina_id?: string;
          aluno_id?: string;
          produto_id?: string;
          qtd_maxima?: number | null;
          criado_em?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "limites_aluno_produtos_cantina_id_fkey";
            columns: ["cantina_id"];
            referencedRelation: "cantinas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "limites_aluno_produtos_aluno_id_fkey";
            columns: ["aluno_id"];
            referencedRelation: "alunos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "limites_aluno_produtos_produto_id_fkey";
            columns: ["produto_id"];
            referencedRelation: "produtos";
            referencedColumns: ["id"];
          }
        ];
      };
      pedidos: {
        Row: {
          id: string;
          cantina_id: string;
          aluno_id: string;
          atendido_por: string | null;
          status: Database["public"]["Enums"]["pedido_status"];
          total: number;
          observacao: string | null;
          criado_em: string | null;
          cancelado_por: string | null;
          cancelado_por_nome: string | null;
          cancelado_em: string | null;
        };
        Insert: {
          id?: string;
          cantina_id: string;
          aluno_id: string;
          atendido_por?: string | null;
          status?: Database["public"]["Enums"]["pedido_status"];
          total?: number;
          observacao?: string | null;
          criado_em?: string | null;
          cancelado_por?: string | null;
          cancelado_por_nome?: string | null;
          cancelado_em?: string | null;
        };
        Update: {
          id?: string;
          cantina_id?: string;
          aluno_id?: string;
          atendido_por?: string | null;
          status?: Database["public"]["Enums"]["pedido_status"];
          total?: number;
          observacao?: string | null;
          criado_em?: string | null;
          cancelado_por?: string | null;
          cancelado_por_nome?: string | null;
          cancelado_em?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "pedidos_cantina_id_fkey";
            columns: ["cantina_id"];
            referencedRelation: "cantinas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pedidos_aluno_id_fkey";
            columns: ["aluno_id"];
            referencedRelation: "alunos";
            referencedColumns: ["id"];
          }
        ];
      };
      itens_pedido: {
        Row: {
          id: string;
          cantina_id: string | null;
          pedido_id: string;
          produto_id: string;
          nome_produto: string;
          preco_unit: number;
          preco_unitario: number;
          quantidade: number;
          subtotal: number;
        };
        Insert: {
          id?: string;
          cantina_id?: string | null;
          pedido_id: string;
          produto_id: string;
          nome_produto: string;
          preco_unit: number;
          preco_unitario?: number;
          quantidade?: number;
        };
        Update: {
          id?: string;
          cantina_id?: string | null;
          pedido_id?: string;
          produto_id?: string;
          nome_produto?: string;
          preco_unit?: number;
          preco_unitario?: number;
          quantidade?: number;
        };
        Relationships: [
          {
            foreignKeyName: "itens_pedido_pedido_id_fkey";
            columns: ["pedido_id"];
            referencedRelation: "pedidos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "itens_pedido_produto_id_fkey";
            columns: ["produto_id"];
            referencedRelation: "produtos";
            referencedColumns: ["id"];
          }
        ];
      };
      transacoes: {
        Row: {
          id: string;
          cantina_id: string;
          conta_id: string;
          pedido_id: string | null;
          tipo: Database["public"]["Enums"]["transacao_tipo"];
          valor: number;
          saldo_apos: number;
          descricao: string | null;
          criado_em: string | null;
        };
        Insert: {
          id?: string;
          cantina_id: string;
          conta_id: string;
          pedido_id?: string | null;
          tipo: Database["public"]["Enums"]["transacao_tipo"];
          valor: number;
          saldo_apos: number;
          descricao?: string | null;
          criado_em?: string | null;
        };
        Update: {
          id?: string;
          cantina_id?: string;
          conta_id?: string;
          pedido_id?: string | null;
          tipo?: Database["public"]["Enums"]["transacao_tipo"];
          valor?: number;
          saldo_apos?: number;
          descricao?: string | null;
          criado_em?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "transacoes_cantina_id_fkey";
            columns: ["cantina_id"];
            referencedRelation: "cantinas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transacoes_conta_id_fkey";
            columns: ["conta_id"];
            referencedRelation: "contas";
            referencedColumns: ["id"];
          }
        ];
      };
      cobrancas: {
        Row: {
          id: string;
          cantina_id: string;
          responsavel_id: string;
          ciclo: Database["public"]["Enums"]["ciclo_cobranca"];
          periodo_inicio: string;
          periodo_fim: string;
          valor_total: number;
          status: Database["public"]["Enums"]["cobranca_status"];
          mensagem_whatsapp: string | null;
          whatsapp_link: string | null;
          enviada_em: string | null;
          lembrete_enviado_em: string | null;
          paga_em: string | null;
          confirmada_por: string | null;
          observacao: string | null;
          criado_em: string | null;
        };
        Insert: {
          id?: string;
          cantina_id: string;
          responsavel_id: string;
          ciclo: Database["public"]["Enums"]["ciclo_cobranca"];
          periodo_inicio: string;
          periodo_fim: string;
          valor_total: number;
          status?: Database["public"]["Enums"]["cobranca_status"];
          mensagem_whatsapp?: string | null;
          whatsapp_link?: string | null;
          enviada_em?: string | null;
          lembrete_enviado_em?: string | null;
          paga_em?: string | null;
          confirmada_por?: string | null;
          observacao?: string | null;
          criado_em?: string | null;
        };
        Update: {
          id?: string;
          cantina_id?: string;
          responsavel_id?: string;
          ciclo?: Database["public"]["Enums"]["ciclo_cobranca"];
          periodo_inicio?: string;
          periodo_fim?: string;
          valor_total?: number;
          status?: Database["public"]["Enums"]["cobranca_status"];
          mensagem_whatsapp?: string | null;
          whatsapp_link?: string | null;
          enviada_em?: string | null;
          lembrete_enviado_em?: string | null;
          paga_em?: string | null;
          confirmada_por?: string | null;
          observacao?: string | null;
          criado_em?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cobrancas_cantina_id_fkey";
            columns: ["cantina_id"];
            referencedRelation: "cantinas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cobrancas_responsavel_id_fkey";
            columns: ["responsavel_id"];
            referencedRelation: "responsaveis";
            referencedColumns: ["id"];
          }
        ];
      };
      pagamentos: {
        Row: {
          id: string;
          cantina_id: string;
          conta_id: string;
          aluno_id: string | null;
          cobranca_id: string | null;
          responsavel_id: string | null;
          valor: number;
          forma_pagamento: string | null;
          tipo: string | null;
          status: Database["public"]["Enums"]["pagamento_status"];
          pix_comprovante_url: string | null;
          pix_txid: string | null;
          confirmado_por: string | null;
          confirmado_em: string | null;
          observacao: string | null;
          criado_em: string | null;
        };
        Insert: {
          id?: string;
          cantina_id: string;
          conta_id?: string;
          aluno_id?: string | null;
          cobranca_id?: string | null;
          responsavel_id?: string | null;
          valor: number;
          forma_pagamento?: string | null;
          tipo?: string | null;
          status?: Database["public"]["Enums"]["pagamento_status"];
          pix_comprovante_url?: string | null;
          pix_txid?: string | null;
          confirmado_por?: string | null;
          confirmado_em?: string | null;
          observacao?: string | null;
          criado_em?: string | null;
        };
        Update: {
          id?: string;
          cantina_id?: string;
          conta_id?: string;
          aluno_id?: string | null;
          cobranca_id?: string | null;
          responsavel_id?: string | null;
          valor?: number;
          forma_pagamento?: string | null;
          tipo?: string | null;
          status?: Database["public"]["Enums"]["pagamento_status"];
          pix_comprovante_url?: string | null;
          pix_txid?: string | null;
          confirmado_por?: string | null;
          confirmado_em?: string | null;
          observacao?: string | null;
          criado_em?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "pagamentos_cantina_id_fkey";
            columns: ["cantina_id"];
            referencedRelation: "cantinas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pagamentos_conta_id_fkey";
            columns: ["conta_id"];
            referencedRelation: "contas";
            referencedColumns: ["id"];
          }
        ];
      };
      notificacoes: {
        Row: {
          id: string;
          cantina_id: string;
          responsavel_id: string;
          pedido_id: string | null;
          titulo: string;
          mensagem: string;
          enviada: boolean | null;
          erro: string | null;
          criado_em: string | null;
        };
        Insert: {
          id?: string;
          cantina_id: string;
          responsavel_id: string;
          pedido_id?: string | null;
          titulo: string;
          mensagem: string;
          enviada?: boolean | null;
          erro?: string | null;
          criado_em?: string | null;
        };
        Update: {
          id?: string;
          cantina_id?: string;
          responsavel_id?: string;
          pedido_id?: string | null;
          titulo?: string;
          mensagem?: string;
          enviada?: boolean | null;
          erro?: string | null;
          criado_em?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notificacoes_cantina_id_fkey";
            columns: ["cantina_id"];
            referencedRelation: "cantinas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notificacoes_responsavel_id_fkey";
            columns: ["responsavel_id"];
            referencedRelation: "responsaveis";
            referencedColumns: ["id"];
          }
        ];
      };
      reposicoes: {
        Row: {
          id: string;
          cantina_id: string;
          produto_id: string;
          quantidade: number;
          criado_em: string | null;
        };
        Insert: {
          id?: string;
          cantina_id: string;
          produto_id: string;
          quantidade: number;
          criado_em?: string | null;
        };
        Update: {
          id?: string;
          cantina_id?: string;
          produto_id?: string;
          quantidade?: number;
          criado_em?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      minha_cantina_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      meu_responsavel_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      fn_gerar_link_cobranca: {
        Args: { p_cobranca_id: string };
        Returns: string;
      };
    };
    Enums: {
      plano_tipo: "free" | "pro" | "premium";
      assinatura_status: "ativa" | "suspensa" | "cancelada" | "trial";
      conta_tipo: "credito" | "fiado";
      pedido_status: "pendente" | "confirmado" | "cancelado";
      transacao_tipo: "consumo" | "recarga" | "estorno" | "ajuste";
      pagamento_status: "pendente" | "confirmado" | "cancelado";
      ciclo_cobranca: "semanal" | "mensal";
      cobranca_status: "pendente" | "enviada" | "paga" | "vencida";
    };
  };
};
